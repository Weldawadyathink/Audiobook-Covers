/**
 * The server functions behind `/admin/upload`.
 *
 * Three round trips, in this order: stage the bytes, start the ingest, subscribe
 * to the run. The split exists because the pipeline runs in Trigger.dev on Node
 * and the browser talks to a Worker — see `src/image/staging.ts` for why the
 * bytes travel through the bucket rather than through a task payload.
 *
 * Every handler is admin-only. `requireAdmin` throws rather than redirecting,
 * which is what the pane wants: a form submission gets an error to show, not a
 * navigation.
 */
import { createServerFn } from "@tanstack/react-start";
import { auth, tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { createReadDb, createWriteDb } from "@/db.cloudflare";
import { image, openlibrary_work } from "@/db/schema";
import { imageIdSchema } from "@/ids";
import { contentTypeForFormat } from "@/image/sniff";
import { isStagingKey, stagingKey } from "@/image/staging";
import { parseRedditCommentId, parseRedditPostId } from "@/reddit/ids";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { requireAdmin } from "@/server/session";
import {
  configureTrigger,
  imagesBucket,
  INGEST_TASK_ID,
  readImageUpload,
} from "@/server/uploadCore";
import type { ingestImageTask } from "@/trigger/image/ingest";

/**
 * Blank means "not given".
 *
 * A form posts every field it renders, so an untouched input arrives as `""`.
 * Written as a transform rather than a preprocess so the *input* type stays
 * `string | undefined` — the page uses `z.input<typeof uploadMetadataSchema>` as
 * its form state, and a preprocess would type every field as `unknown`.
 */
const blankToUndefined = <T extends z.ZodType<string>>(schema: T) =>
  z
    .union([z.literal(""), schema])
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const optionalText = (max: number) =>
  blankToUndefined(z.string().trim().max(max));

const workIdSchema = z
  .string()
  .trim()
  .regex(/^OL\d+W$/, "not an OpenLibrary work id");

/**
 * Accepts whatever the admin had on the clipboard.
 *
 * The pane normalises on blur, so most submissions arrive already bare; this is
 * what catches the ones that do not — a paste followed straight by the keyboard,
 * or a value set programmatically. Normalising in both places costs one function
 * call and means neither has to trust the other.
 */
const redditIdSchema = (
  parse: (input: string) => string | null,
  what: string,
) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const id = parse(value);
      if (!id) {
        ctx.addIssue({
          code: "custom",
          message: `Could not find a Reddit ${what} id in "${value}".`,
        });
        return z.NEVER;
      }
      return id;
    });

/**
 * The metadata shared by every file in one submission.
 *
 * Shared rather than per-file because that is what a real manual import looks
 * like: a Drive folder or a gallery post carries a dozen covers from one source,
 * and typing the same URL twelve times is how a source URL ends up subtly wrong
 * on the fourth one.
 */
const uploadMetadataSchema = z.object({
  source: optionalText(2000),
  upstreamUrl: optionalText(2000),
  redditPostId: blankToUndefined(redditIdSchema(parseRedditPostId, "post")),
  redditCommentId: blankToUndefined(
    redditIdSchema(parseRedditCommentId, "comment"),
  ),
  searchable: z.boolean().default(true),
  openlibraryWorkId: blankToUndefined(workIdSchema),
  classify: z.boolean().default(true),
});

const stagedItemSchema = z.object({
  key: z.string().refine(isStagingKey, "not a staged upload key"),
  /** Confirmed past a duplicate review. */
  force: z.boolean().default(false),
  supersede: z.array(imageIdSchema).default([]),
  /** Overrides the submission-wide match, for inheriting one from a duplicate. */
  openlibraryWorkId: workIdSchema.optional(),
});

export type UploadMetadata = z.input<typeof uploadMetadataSchema>;

/**
 * Put one uploaded file in the bucket and hand back its key.
 *
 * Takes `FormData` because the payload is a file; every other server function
 * here takes JSON. The response is deliberately not a URL — the browser already
 * has the bytes and previews them from an object URL, so publishing a link to the
 * staged object would be handing out a public URL for no reason.
 */
export const stageUpload = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected a multipart upload");
    }
    return data;
  })
  .handler(async ({ data }) => {
    await requireAdmin();

    const file = await readImageUpload(data);
    const key = stagingKey();

    await imagesBucket().put(key, file.bytes, {
      httpMetadata: {
        contentType: contentTypeForFormat(file.format),
        // Staged objects are transient and world-readable by key. Nothing should
        // ever be caching one.
        cacheControl: "no-store",
      },
    });

    return {
      key,
      filename: file.filename,
      format: file.format,
      bytes: file.bytes.byteLength,
    };
  });

/**
 * Start one `ingest-image` run per staged file.
 *
 * Returns a public access token scoped to exactly these runs so the browser can
 * stream their progress. Scoped rather than a general read token because it is
 * handed to a client: it can read the runs it names and nothing else in the
 * project.
 */
export const startImageIngest = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      items: z.array(stagedItemSchema).min(1).max(24),
      metadata: uploadMetadataSchema,
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    configureTrigger();

    const { metadata } = data;
    // A Reddit post id is enough to say where a cover came from, and the site
    // already knows how to display this shape — `shapeImageData` rewrites
    // `https://reddit.com/<id>` to a redd.it link. Deriving it here means the
    // common case needs one field, not two saying the same thing.
    const source =
      metadata.source ??
      (metadata.redditPostId
        ? `https://reddit.com/${metadata.redditPostId}`
        : null);

    const runs = await Promise.all(
      data.items.map(async (item) => {
        const handle = await tasks.trigger<typeof ingestImageTask>(
          INGEST_TASK_ID,
          {
            bytes: { kind: "staged", key: item.key },
            source,
            upstreamUrl: metadata.upstreamUrl ?? null,
            redditPostId: metadata.redditPostId ?? null,
            redditCommentId: metadata.redditCommentId ?? null,
            searchable: metadata.searchable,
            openlibraryWorkId:
              item.openlibraryWorkId ?? metadata.openlibraryWorkId ?? null,
            classify: metadata.classify,
            force: item.force,
            supersede: item.supersede,
          },
        );
        return { key: item.key, runId: handle.id };
      }),
    );

    const publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: runs.map((run) => run.runId) } },
      // Long enough for the slowest stage — a four-phase agentic classification
      // behind whatever queue depth the project has — without minting a token
      // that outlives the page it was issued to.
      expirationTime: "2h",
    });

    await captureAnalyticsEvent({
      data: {
        eventType: "adminImageUploadStarted",
        payload: {
          files: runs.length,
          email: admin.email,
          redditPostId: metadata.redditPostId ?? null,
          forced: data.items.some((item) => item.force),
        },
      },
    });

    return { runs, publicAccessToken };
  });

/**
 * Throw away a staged file the admin decided not to ingest.
 *
 * Not merely tidiness: the staged object is public to anyone holding the key, so
 * a rejected duplicate that is never ingested should stop existing at the moment
 * it is rejected. Successful runs delete their own staged object.
 */
export const discardStagedUpload = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().refine(isStagingKey) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await imagesBucket().delete(data.key);
    return { discarded: true };
  });

/**
 * Copy a near-duplicate's book match onto a freshly ingested image.
 *
 * The classifier runs on every upload by default, even when the image supersedes
 * a copy that was already matched, because a fresh look is the honest default and
 * the old match may itself have been a guess. This is the override: an admin who
 * can see both covers and the matched work decides the answer carries over, and
 * that decision is a human one — so it lands as `HUMAN`, outranking whatever
 * confidence the source row had.
 */
export const inheritImageMatch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: imageIdSchema, fromId: imageIdSchema }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const readDb = createReadDb();

    const [source] = await readDb
      .select({
        workId: image.openlibrary_work_id,
        title: openlibrary_work.title,
      })
      .from(image)
      .leftJoin(
        openlibrary_work,
        eq(openlibrary_work.olid, image.openlibrary_work_id),
      )
      .where(eq(image.id, data.fromId))
      .limit(1);

    if (!source?.workId) {
      throw new Error(`${data.fromId} has no book match to inherit.`);
    }

    const writeDb = createWriteDb();
    await writeDb
      .update(image)
      .set({
        openlibrary_work_id: source.workId,
        openlibrary_work_id_confidence: "HUMAN",
        openlibrary_work_id_model: null,
      })
      .where(eq(image.id, data.id));

    await captureAnalyticsEvent({
      data: {
        eventType: "adminImageMatchInherited",
        payload: {
          id: data.id,
          fromId: data.fromId,
          workId: source.workId,
          email: admin.email,
        },
      },
    });

    return { workId: source.workId, title: source.title };
  });
