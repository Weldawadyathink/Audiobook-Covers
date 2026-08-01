/**
 * The handoff between a browser upload and the ingest task.
 *
 * A manual upload arrives as bytes in a browser, and the pipeline that turns
 * bytes into a cover runs in Trigger.dev, on Node, half a minute later. The two
 * cannot pass a file directly: the Worker cannot use `src/trigger/s3.ts` (it
 * imports `node:stream` and reads credentials from `process.env`), and putting
 * multi-megabyte base64 in a task payload runs into Trigger's payload ceiling.
 *
 * So the Worker writes the bytes to the object store through its R2 binding and
 * the task reads them back with the S3 client it already has. This module is the
 * contract between them, and it is deliberately dependency-free so both runtimes
 * can import it.
 */

/**
 * Where staged uploads live, in the same bucket as the catalogue.
 *
 * That bucket is served publicly at images.audiobookcovers.com, so a staged key
 * is world-readable to anyone who knows it. The key is 32 hex characters of
 * CSPRNG and the object is deleted the moment the pipeline copies it to
 * `original/`, which makes it unguessable and short-lived rather than private.
 * Worth knowing before staging anything here that is not a book cover an admin
 * is about to publish anyway.
 */
export const STAGING_PREFIX = "incoming";

/**
 * 25MB.
 *
 * Set by what the decoder can survive rather than by what the network can carry:
 * `generate-image-sizes` holds a full-resolution RGBA bitmap plus encoder scratch
 * space in memory, which is why it runs on a `small-2x` machine. The largest
 * cover in the catalogue is comfortably under a megabyte, so this is a guard
 * against a mistake (a PDF, a screenshot of a screen recording) rather than a
 * real limit anybody will meet.
 */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** A staging key nobody can guess. Callable from a Worker and from Node. */
export function stagingKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${STAGING_PREFIX}/${random}`;
}

/**
 * True for keys this pipeline minted.
 *
 * The ingest task takes a key from a server function and hands it to the object
 * store, so without this check an `original/<id>.jpg` value would let a caller
 * read — and, once ingest finishes and deletes the staged object, destroy — any
 * object in the bucket.
 */
export function isStagingKey(key: string): boolean {
  return new RegExp(`^${STAGING_PREFIX}/[0-9a-f]{32}$`).test(key);
}
