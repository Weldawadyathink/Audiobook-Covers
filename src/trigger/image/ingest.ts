/**
 * Bytes in, a finished cover out. The one way an `image` row gets created.
 *
 * Everything that adds to the catalogue is meant to come through here: the
 * `/admin/upload` pane does today, and the Reddit archiver — which does not exist
 * yet, see `docs/reddit-import.md` — is expected to, one call per URL it extracts.
 * That is why the payload takes either a staged object or a URL: a browser upload
 * has bytes and no address worth fetching, while the archiver has an address and
 * would rather this task did the downloading.
 *
 * The stages are all pre-existing tasks; the value here is the order and the
 * bookkeeping between them:
 *
 *   hash        decode, perceptual hash, dimensions
 *   dedupe      near-duplicate lookup, and the decision about what to do
 *   row         claim an id in Postgres, insert the metadata
 *   original    copy the bytes to original/<id>.<ext>
 *   reddit      stub the referenced post so provenance resolves
 *   derivatives generate-image-sizes: nine objects, plus blurhash and true format
 *   embedding   rebuild-embedding: the pgvector column search runs on
 *   classify    extract-olid: the agentic OpenLibrary match
 *   supersede   hide the lower-resolution copies this image replaces
 *
 * Order matters in three places. The row is inserted *before* the bytes are
 * uploaded, because the primary key is what resolves an id collision and it can
 * only do that if the row exists — see `generateImageId` in `src/ids.ts`.
 * Derivatives come before classification, because `extract-olid` reads
 * `jpeg/640/<id>.jpg` and there is nothing there until they run. And superseding
 * happens last, after the new image is known to be displayable: hiding the copy it
 * replaces any earlier would leave a failed run with both versions invisible.
 *
 * A run that throws unwinds itself: the bytes move to `failed/`, everything it
 * wrote under a prefix the site serves from is deleted, and the row is purged —
 * see `quarantine`. A half-ingested image is worse than none, because it is a
 * pixel-perfect duplicate of whatever the admin is about to upload again.
 *
 * Progress is published to run metadata as it goes, one entry per stage, which is
 * what the upload pane subscribes to. A stage that is genuinely not applicable is
 * recorded as skipped with a reason rather than left pending, so a finished run
 * has something to say about every line of its own checklist.
 */
import { logger, metadata, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { createPostgresWriteDb, textArray } from "@/db.node";
import { schemaName } from "@/db/schema";
import { generateImageId } from "@/ids";
import {
  contentTypeForFormat,
  extensionForFormat,
  type ImageFormat,
} from "@/image/sniff";
import { isStagingKey, MAX_IMAGE_BYTES, STAGING_PREFIX } from "@/image/staging";
import { defaultModelName } from "@/searchModels/models";
import { S3Client } from "@/trigger/s3";
import { triggerAndWait } from "@/trigger/utils";
import { ensurePostStubs } from "@/trigger/reddit/archive";
import { generateImageSizesTask } from "./generate-sizes";
import { rebuildEmbeddingTask } from "@/trigger/embedding/rebuild-embedding";
import { extractOlidTask } from "@/trigger/extract-olid";
import {
  findDuplicates,
  hashUpload,
  judgeDuplicates,
  PHASH_THRESHOLD,
  type Duplicate,
  type HashedUpload,
} from "./duplicates";

/** Reddit base36 ids, which is all `image.reddit_*_id` is ever allowed to hold. */
const redditIdSchema = z
  .string()
  .regex(/^[0-9a-z]+$/, "not a Reddit base36 id")
  .max(16);

const IngestImagePayload = z.object({
  /**
   * Where the bytes come from. A staged key is an object the Worker wrote and
   * this task consumes; a URL is fetched here, which is the shape the archiver
   * wants.
   */
  bytes: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("staged"), key: z.string() }),
    z.object({ kind: z.literal("url"), url: z.url() }),
  ]),
  /** `image.source`: the page to link a visitor to. */
  source: z.string().nullish(),
  /** `image.upstream_url`: the exact address the bytes came from, if any. */
  upstreamUrl: z.string().nullish(),
  redditPostId: redditIdSchema.nullish(),
  redditCommentId: redditIdSchema.nullish(),
  searchable: z.boolean().default(true),
  /**
   * A match the human already knows. Stamped `HUMAN` and skips the classifier —
   * there is no point paying four LLM calls to guess an answer somebody has
   * typed in.
   */
  openlibraryWorkId: z.string().nullish(),
  /** Run the agentic OpenLibrary classifier when no match was supplied. */
  classify: z.boolean().default(true),
  /**
   * Proceed despite near-duplicates. Set by the review step in the upload pane,
   * never by default: without it a run that finds an ambiguous match stops and
   * returns the matches instead of writing anything.
   */
  force: z.boolean().default(false),
  /**
   * Ids to mark unsearchable once this image is live. Intersected with the
   * matches actually found, so a stale or hand-edited list cannot hide a cover
   * that has nothing to do with this upload.
   */
  supersede: z.array(z.string()).default([]),
});

const STEPS = [
  "hash",
  "dedupe",
  "row",
  "original",
  "reddit",
  "derivatives",
  "embedding",
  "classify",
  "supersede",
] as const;

type StepName = (typeof STEPS)[number];
type StepState = "pending" | "running" | "done" | "skipped" | "review";

// A type alias rather than an interface: `metadata.set` takes
// `DeserializedJson`, and only aliases get the implicit index signature that
// makes an object with known keys assignable to it.
type Step = {
  status: StepState;
  detail?: string;
};

/**
 * Per-stage status, published to run metadata after every transition.
 *
 * Metadata rather than logs because the upload pane needs to render it live, and
 * Trigger's realtime stream carries metadata to the browser for free. A failure
 * is deliberately *not* a status here: the stage stays `running` and the run
 * itself fails, which is the state the dashboard and the pane both already show
 * — duplicating it in metadata would just create two places that can disagree.
 */
function createSteps() {
  const steps = Object.fromEntries(
    STEPS.map((name) => [name, { status: "pending" } as Step]),
  ) as Record<StepName, Step>;

  const publish = () => {
    metadata.set("steps", steps);
  };
  publish();

  return {
    start(name: StepName) {
      steps[name] = { status: "running" };
      publish();
    },
    done(name: StepName, detail?: string) {
      steps[name] = { status: "done", detail };
      publish();
    },
    skip(name: StepName, detail: string) {
      steps[name] = { status: "skipped", detail };
      publish();
    },
    review(name: StepName, detail: string) {
      steps[name] = { status: "review", detail };
      publish();
    },
  };
}

export const ingestImageTask = schemaTask({
  id: "ingest-image",
  schema: IngestImagePayload,
  // The perceptual hash decodes the full-resolution original into a Float32 luma
  // plane, on top of whatever the decoder itself allocates. Same reasoning as
  // `generate-image-sizes`, which runs on the same size for the same reason.
  machine: "small-2x",
  // Derivatives, embedding and a four-phase agentic classification, each of them
  // a child run this one waits on.
  maxDuration: 1800,
  run: async (payload) => {
    const steps = createSteps();
    const s3 = new S3Client("default");
    const { sql } = createPostgresWriteDb({ application_name: "ingest-image" });
    // Everything the failure path needs to undo a partial run. Filled in as the
    // run goes, read only by `quarantine`.
    const progress: Progress = { derivatives: [] };

    try {
      steps.start("hash");
      const bytes = await loadBytes(s3, payload.bytes);
      const upload = await hashUpload(bytes);
      const extension = extensionForFormat(upload.format);
      progress.bytes = bytes;
      progress.format = upload.format;
      progress.extension = extension;
      steps.done(
        "hash",
        `${upload.format} ${upload.width}x${upload.height}, ${upload.bytes} bytes`,
      );

      steps.start("dedupe");
      const duplicates = await findDuplicates(sql, upload.phash64);
      const verdict = payload.force
        ? ({
            kind: "supersede",
            // Whatever the caller asked for, restricted to images this upload
            // actually matches.
            ids: payload.supersede.filter((id) =>
              duplicates.some((duplicate) => duplicate.id === id),
            ),
          } as const)
        : judgeDuplicates(upload, duplicates);

      if (verdict.kind === "review") {
        steps.review("dedupe", verdict.reasons.join("; "));
        logger.info("stopping for duplicate review", {
          reasons: verdict.reasons,
        });
        return {
          status: "needs-review" as const,
          upload,
          duplicates,
          reasons: verdict.reasons,
          threshold: PHASH_THRESHOLD,
        };
      }
      const supersede = verdict.kind === "supersede" ? verdict.ids : [];
      steps.done(
        "dedupe",
        describeDuplicates(duplicates, supersede, payload.force),
      );

      steps.start("row");
      const id = await claimRow(sql, payload, upload, extension);
      progress.id = id;
      steps.done("row", id);

      steps.start("original");
      const key = `original/${id}.${extension}`;
      await s3.createObject(key, bytes, contentTypeForFormat(upload.format), {
        cacheControl: ORIGINAL_CACHE_CONTROL,
      });
      progress.originalKey = key;
      if (payload.bytes.kind === "staged") {
        // Only after the copy has landed. A staged object deleted before this
        // point would leave a re-run with no bytes to read.
        await s3.safeDeleteObject(payload.bytes.key);
      }
      steps.done("original", key);

      if (payload.redditPostId) {
        steps.start("reddit");
        const stubs = await ensurePostStubs(sql, [payload.redditPostId]);
        steps.done(
          "reddit",
          stubs > 0
            ? `stubbed ${payload.redditPostId}, queued for hydration`
            : `${payload.redditPostId} already known`,
        );
      } else {
        steps.skip("reddit", "no Reddit post id given");
      }

      steps.start("derivatives");
      const derivatives = await triggerAndWait({
        task: generateImageSizesTask,
        payload: { id, force: false },
      });
      if ("written" in derivatives) {
        progress.derivatives = derivatives.written;
      }
      steps.done(
        "derivatives",
        "written" in derivatives
          ? `${derivatives.written.length} objects, blurhash ${derivatives.blurhash}`
          : `skipped: ${derivatives.skipped}`,
      );

      steps.start("embedding");
      await triggerAndWait({
        task: rebuildEmbeddingTask,
        payload: { id, modelName: defaultModelName },
      });
      steps.done("embedding", defaultModelName);

      const openlibrary = await classify(steps, sql, id, payload);

      if (supersede.length > 0) {
        steps.start("supersede");
        // `superseded_by` is the only durable record of this decision. Without
        // it the hidden row looks exactly like one an admin hid by hand, and
        // the copy that replaced it is findable only in this run's output.
        await sql`
          UPDATE ${sql(schemaName)}.image
          SET searchable = false,
              superseded_by = ${id}
          WHERE id = ANY(${textArray(supersede)}::text[])
        `;
        steps.done(
          "supersede",
          `${supersede.join(", ")} hidden from search in favour of ${id}`,
        );
      } else {
        steps.skip("supersede", "nothing to replace");
      }

      return {
        status: "ingested" as const,
        id,
        extension,
        upload,
        duplicates,
        superseded: supersede,
        openlibrary,
      };
    } catch (error) {
      await quarantine(s3, sql, payload, progress);
      throw error;
    } finally {
      await sql.end();
    }
  },
});

/** What a partially finished run has left lying around. */
interface Progress {
  bytes?: Buffer;
  format?: ImageFormat;
  extension?: string;
  id?: string;
  originalKey?: string;
  /** Keys `generate-image-sizes` reported writing, if it got that far. */
  derivatives: string[];
}

/**
 * Where the bytes of a failed ingest go.
 *
 * Nothing reads this prefix. It exists so a failure is diagnosable — the file
 * that broke the decoder is the one thing about a failed run that cannot be
 * reconstructed from the logs — and so an admin retrying an upload is not
 * silently retrying against debris.
 */
const FAILED_PREFIX = "failed";

/**
 * Undo a partial run, then let the error carry on.
 *
 * The row is claimed before the derivatives exist, which is what makes an id
 * collision resolvable (see `generateImageId`) and what leaves an orphan behind
 * when anything downstream fails: a row with a `phash64` and no objects. Left in
 * place, that orphan is a perfect-distance, equal-resolution duplicate of the
 * very file the admin is about to re-upload, so the retry stops for a review
 * against the wreckage of its own previous attempt — with a broken thumbnail,
 * because the derivatives it would be compared against were never written.
 *
 * Retries are `maxAttempts: 1` project-wide, so there is no later attempt this
 * would be pulling the ground out from under.
 *
 * Deliberately swallows its own errors. This runs on the way to re-throwing the
 * real failure, and a cleanup that fails must not replace the diagnosis with a
 * complaint about tidying up. What it cannot cover is a run that dies without
 * unwinding — an out-of-memory kill or a `maxDuration` abort — which still
 * leaves an orphan behind.
 */
async function quarantine(
  s3: S3Client,
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  payload: z.infer<typeof IngestImagePayload>,
  progress: Progress,
) {
  try {
    if (progress.bytes && progress.format && progress.extension) {
      // Named after the id when there was one, so a failure can be traced back
      // to its run; after the staged key otherwise, which is equally unique.
      const name =
        progress.id ??
        (payload.bytes.kind === "staged"
          ? payload.bytes.key.slice(STAGING_PREFIX.length + 1)
          : crypto.randomUUID());
      const key = `${FAILED_PREFIX}/${name}.${progress.extension}`;
      await s3.createObject(
        key,
        progress.bytes,
        contentTypeForFormat(progress.format),
        { cacheControl: "no-store" },
      );
      logger.info(`kept the bytes of a failed ingest at ${key}`);
    }

    // Everything the run published under a prefix the site serves from.
    const live = [...progress.derivatives];
    if (progress.originalKey) live.push(progress.originalKey);
    if (live.length > 0) await s3.safeDeleteObject(live);

    // Only reachable if the run failed before copying it out; a successful copy
    // deletes it already.
    if (payload.bytes.kind === "staged") {
      await s3.safeDeleteObject(payload.bytes.key);
    }

    if (progress.id) {
      await sql`
        DELETE FROM ${sql(schemaName)}.image WHERE id = ${progress.id}
      `;
      logger.info(`purged the orphaned row ${progress.id}`);
    }
  } catch (error) {
    logger.error("could not clean up after a failed ingest", {
      id: progress.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * One week, matching the derivatives.
 *
 * The original is the only object here that is genuinely immutable — its key
 * contains an id that is claimed once and never reused — but it is served from
 * the same public bucket as the derivatives, and a single TTL across the bucket
 * is one less thing to be wrong about. See the long note in `generate-sizes.ts`.
 */
const ORIGINAL_CACHE_CONTROL = "public, max-age=604800";

async function loadBytes(
  s3: S3Client,
  source: z.infer<typeof IngestImagePayload>["bytes"],
): Promise<Buffer> {
  if (source.kind === "staged") {
    // The key comes from a payload, and this function hands it to the object
    // store; anything outside the staging prefix would be an arbitrary read of
    // the bucket, followed by an arbitrary delete once the copy succeeds.
    if (!isStagingKey(source.key)) {
      throw new Error(`Not a staged upload key: ${source.key}`);
    }
    const object = await s3.safeGetObject(source.key);
    if (!object) {
      throw new Error(
        `Nothing staged at ${source.key}. The upload may already have been ingested or discarded.`,
      );
    }
    return Buffer.from(await object.transformToByteArray());
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText} fetching ${source.url}`,
    );
  }
  // Checked before reading the body as well as after: a declared length is the
  // only chance to refuse a multi-gigabyte response without buffering it.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    throw new Error(
      `${source.url} declares ${declared} bytes, over the ${MAX_IMAGE_BYTES} limit`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `${source.url} is ${bytes.byteLength} bytes, over the ${MAX_IMAGE_BYTES} limit`,
    );
  }
  return bytes;
}

function describeDuplicates(
  duplicates: readonly Duplicate[],
  supersede: readonly string[],
  forced: boolean,
) {
  if (duplicates.length === 0) return "no near-duplicates";
  const found = `${duplicates.length} match${duplicates.length === 1 ? "" : "es"} within ${PHASH_THRESHOLD} bits`;
  const outcome =
    supersede.length > 0
      ? `replacing ${supersede.join(", ")}`
      : "keeping both copies";
  return forced ? `${found}, ${outcome} (confirmed)` : `${found}, ${outcome}`;
}

/**
 * Insert the row, retrying on the vanishingly unlikely id collision.
 *
 * `ON CONFLICT DO NOTHING ... RETURNING` returns no rows when the id is taken,
 * which is the whole collision check: the database's unique constraint decides,
 * not a prior SELECT that another run could race.
 */
async function claimRow(
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  payload: z.infer<typeof IngestImagePayload>,
  upload: HashedUpload,
  extension: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateImageId();
    const inserted = (await sql`
      INSERT INTO ${sql(schemaName)}.image (
        id, source, upstream_url, reddit_post_id, reddit_comment_id,
        extension, searchable, deleted, phash64, width, height, bytes,
        original_format, openlibrary_work_id, openlibrary_work_id_confidence
      ) VALUES (
        ${id},
        ${payload.source ?? null},
        ${payload.upstreamUrl ?? null},
        ${payload.redditPostId ?? null},
        ${payload.redditCommentId ?? null},
        ${extension},
        ${payload.searchable},
        false,
        ${upload.phash64}::bit(64),
        ${upload.width},
        ${upload.height},
        ${upload.bytes},
        ${upload.format},
        ${payload.openlibraryWorkId ?? null},
        ${payload.openlibraryWorkId ? "HUMAN" : null}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `) as unknown as { id: string }[];

    if (inserted.length > 0) return id;
    logger.warn(`image id ${id} was already taken, generating another`);
  }
  throw new Error("Could not claim an unused image id in 5 attempts");
}

/**
 * Settle `openlibrary_work_id`, one of three ways.
 *
 * A hand-entered match is authoritative and was already written by `claimRow`,
 * so the classifier is skipped rather than run and ignored.
 */
async function classify(
  steps: ReturnType<typeof createSteps>,
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  id: string,
  payload: z.infer<typeof IngestImagePayload>,
) {
  if (payload.openlibraryWorkId) {
    const title = await workTitle(sql, payload.openlibraryWorkId);
    steps.skip(
      "classify",
      `set by hand to ${payload.openlibraryWorkId}${title ? ` (${title})` : ""}`,
    );
    return {
      workId: payload.openlibraryWorkId,
      confidence: "HUMAN" as const,
      title,
      origin: "manual" as const,
    };
  }

  if (!payload.classify) {
    steps.skip("classify", "classification turned off for this upload");
    return null;
  }

  steps.start("classify");
  const { result } = await triggerAndWait({
    task: extractOlidTask,
    payload: { imageId: id, save: true },
  });

  if (!result?.openlibrary_work_id) {
    steps.done("classify", "no confident match found");
    return null;
  }

  const title = await workTitle(sql, result.openlibrary_work_id);
  steps.done(
    "classify",
    `${result.openlibrary_work_id} (${result.evidence})${title ? ` — ${title}` : ""}`,
  );
  return {
    workId: result.openlibrary_work_id,
    confidence: result.evidence,
    title,
    origin: "classified" as const,
  };
}

async function workTitle(
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  olid: string,
): Promise<string | null> {
  const rows = (await sql`
    SELECT title FROM ${sql(schemaName)}.openlibrary_work WHERE olid = ${olid}
  `) as unknown as { title: string }[];
  return rows[0]?.title ?? null;
}
