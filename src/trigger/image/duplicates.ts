/**
 * Is this picture already in the catalogue, and if so which copy should win?
 *
 * Runs before anything is inserted. That ordering is the whole point: an image
 * row is an S3 key, a public URL and a search result, and the cheapest moment to
 * decide a cover is a duplicate is before any of those exist. The alternative —
 * insert first and reconcile later — means the site can serve two copies of the
 * same cover in the meantime.
 *
 * The hash is computed with the same `decodeImage` + `downscaleToSquare` +
 * `perceptualHash` path that `src/scripts/dedupeImages.ts` used to fill in
 * `phash64` for the existing catalogue, and deliberately not with the decoder in
 * `src/image/codec.ts`. Both produce a greyscale square, but a different
 * downscale filter moves low-frequency DCT coefficients slightly, and a hash that
 * drifts from the stored ones is a duplicate detector that quietly stops
 * detecting. One extra decode per upload is the price of comparability.
 */
import { z } from "zod/v4";
import type postgres from "postgres";
import { schemaName } from "@/db/schema";
import { decodeImage, downscaleToSquare } from "@/image/imagePixels";
import { DCT_SIZE, perceptualHash } from "@/image/perceptualHash";
import type { ImageFormat } from "@/image/sniff";

type Sql = ReturnType<typeof postgres>;

/**
 * Hamming distance at which two hashes are the same picture.
 *
 * Measured, not guessed — see the comment on `image.phash64` in the schema. Over
 * 400 covers hashed at two resolutions, the same-image distance never exceeded 2
 * while the closest distinct pair sat at 10.
 */
export const PHASH_THRESHOLD = 4;

export interface HashedUpload {
  /** 64 characters of `0`/`1`, ready for a `bit(64)` parameter. */
  phash64: string;
  width: number;
  height: number;
  bytes: number;
  /** Sniffed from the bytes, never from a filename. */
  format: ImageFormat;
}

export async function hashUpload(bytes: Buffer): Promise<HashedUpload> {
  const decoded = await decodeImage(bytes);
  return {
    phash64: perceptualHash(downscaleToSquare(decoded, DCT_SIZE)),
    width: decoded.width,
    height: decoded.height,
    bytes: bytes.byteLength,
    format: decoded.format,
  };
}

const DuplicateRow = z.object({
  id: z.string(),
  distance: z.coerce.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  bytes: z.number().int().nullable(),
  extension: z.string().nullable(),
  blurhash: z.string().nullable(),
  searchable: z.boolean().nullable(),
  deleted: z.boolean(),
  openlibrary_work_id: z.string().nullable(),
  openlibrary_work_id_confidence: z.string().nullable(),
  openlibrary_title: z.string().nullable(),
  /**
   * Joined in SQL rather than returned as `text[]`.
   *
   * Every connection in this repo sets `fetch_types: false`, which leaves
   * postgres-js without the OIDs it needs to parse an array — the same reason
   * `textArray()` exists for the other direction. One string is all the review
   * card wants anyway.
   */
  openlibrary_authors: z.string().nullable(),
});

export type Duplicate = z.infer<typeof DuplicateRow>;

/**
 * Every catalogue image within `PHASH_THRESHOLD` bits of this upload.
 *
 * A sequential scan by design: no index can serve a Hamming predicate, and
 * `bit_count(a # b)` over the whole table is milliseconds for a single probe —
 * unlike the pairwise self-join in the dedupe report, which is the same
 * comparison n² times.
 *
 * Soft-deleted rows are included, and the caller treats them as a reason to stop
 * and ask. A cover that was deleted was deleted for a reason, and silently
 * re-adding it is the one duplicate outcome nobody wants.
 */
export async function findDuplicates(
  sql: Sql,
  phash64: string,
  threshold = PHASH_THRESHOLD,
): Promise<Duplicate[]> {
  const rows = await sql`
    SELECT
      image.id,
      bit_count(image.phash64 # ${phash64}::bit(64)) AS distance,
      image.width,
      image.height,
      image.bytes,
      image.extension,
      image.blurhash,
      image.searchable,
      image.deleted,
      image.openlibrary_work_id,
      image.openlibrary_work_id_confidence,
      work.title AS openlibrary_title,
      nullif(array_to_string(work.author_names, ', '), '') AS openlibrary_authors
    FROM ${sql(schemaName)}.image AS image
    LEFT JOIN ${sql(schemaName)}.openlibrary_work AS work
      ON work.olid = image.openlibrary_work_id
    WHERE image.phash64 IS NOT NULL
      AND bit_count(image.phash64 # ${phash64}::bit(64)) <= ${threshold}
    ORDER BY distance, image.id
  `;

  return z.array(DuplicateRow).parse(rows);
}

export type DuplicateVerdict =
  /** Nothing like it in the catalogue. Ingest without asking. */
  | { kind: "clear" }
  /** Strictly better than every match. Ingest, and hide the ones it replaces. */
  | { kind: "supersede"; ids: string[] }
  /** A human has to look. Nothing is written. */
  | { kind: "review"; reasons: string[] };

function pixels(item: { width: number | null; height: number | null }) {
  return item.width !== null && item.height !== null
    ? item.width * item.height
    : null;
}

/**
 * What to do about the matches, without asking anybody.
 *
 * A higher-resolution copy of a cover already held is the overwhelmingly common
 * case for a manual upload — somebody found the original artwork behind a
 * Reddit-compressed repost — so it goes through unattended, and the copies it
 * beats are marked unsearchable rather than deleted. Nothing is destroyed by an
 * automatic decision here: the image keeps its id, its URL and its objects,
 * `image.superseded_by` records which copy replaced it, and the Searchable
 * toggle on `/images/<id>` puts it back.
 *
 * Everything else stops for review: an equal or lower resolution match (where
 * "which one is better" is not a question pixel count can answer), a match whose
 * dimensions were never recorded, and any match that has been deleted.
 */
export function judgeDuplicates(
  upload: HashedUpload,
  duplicates: readonly Duplicate[],
): DuplicateVerdict {
  if (duplicates.length === 0) return { kind: "clear" };

  const reasons: string[] = [];
  const uploadPixels = upload.width * upload.height;

  for (const duplicate of duplicates) {
    if (duplicate.deleted) {
      reasons.push(
        `${duplicate.id} is a deleted image ${duplicate.distance} bits away — it may have been rejected before`,
      );
      continue;
    }
    const existing = pixels(duplicate);
    if (existing === null) {
      reasons.push(
        `${duplicate.id} has no recorded dimensions, so there is nothing to compare against`,
      );
      continue;
    }
    if (uploadPixels <= existing) {
      reasons.push(
        `${duplicate.id} is already ${duplicate.width}x${duplicate.height}, ` +
          `and this upload is ${upload.width}x${upload.height}`,
      );
    }
  }

  if (reasons.length > 0) return { kind: "review", reasons };

  return { kind: "supersede", ids: duplicates.map((row) => row.id) };
}
