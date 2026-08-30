import { customAlphabet } from "nanoid";
import { z } from "zod/v4";

/**
 * Public identifiers for images.
 *
 * Images are addressed by id in three places at once — the database primary
 * key, the `/image/<id>` URL, and the S3 object key — so the id format is a
 * user-visible design decision, not an implementation detail. Nanoids are
 * chosen over uuids for the reasons PlanetScale lay out for their own API:
 * shorter URLs, no hyphens to break a double-click selection, and nothing that
 * looks like an internal database artefact.
 *
 * The alphabet is deliberately lowercase-only. Mixed case buys ~11 bits at
 * this length but costs correctness everywhere a human retypes or dictates an
 * id, and S3 keys and URLs are both case-sensitive — a case-folded id would
 * 404 rather than redirect.
 */
export const IMAGE_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * 8 characters of a 36-symbol alphabet: 36^8 ≈ 2.8e12, or 41.4 bits.
 *
 * By the birthday bound (p ≈ n²/2N) the chance of *any* collision across the
 * whole catalogue is 0.002% at 10k images, 0.18% at 100k, and ~16% at 1M. That
 * is comfortable at the scale this project operates at and uncomfortable an
 * order of magnitude above it.
 *
 * Widening later is cheap and does not require a backfill: the column is text,
 * and a 9-character id cannot collide with an 8-character one, so lengths mix
 * freely. Anything that consumes an id must therefore treat this as the length
 * ids *currently* get generated at, not as a fixed width to validate against.
 */
export const IMAGE_ID_LENGTH = 8;

const generate = customAlphabet(IMAGE_ID_ALPHABET, IMAGE_ID_LENGTH);

/**
 * Substrings that must not appear in an id that ends up in a public URL.
 *
 * Eight characters drawn from a full alphanumeric alphabet will eventually
 * spell something, and roughly one id in a few thousand contains one of these.
 * Filtering at generation is free; discovering it in a shared link is not.
 */
const BLOCKED_SUBSTRINGS = [
  "anal",
  "anus",
  "arse",
  "bastard",
  "bitch",
  "boob",
  "chink",
  "clit",
  "cock",
  "coon",
  "cum",
  "cunt",
  "dick",
  "dyke",
  "fag",
  "fuck",
  "gook",
  "jap",
  "jizz",
  "kike",
  "kunt",
  "nazi",
  "negro",
  "nigg",
  "penis",
  "piss",
  "poop",
  "porn",
  "pube",
  "puss",
  "queer",
  "rape",
  "rapist",
  "retard",
  "scat",
  "semen",
  "sex",
  "shit",
  "slut",
  "spic",
  "sperm",
  "tits",
  "turd",
  "twat",
  "vagina",
  "wank",
  "whore",
];

function isAcceptable(id: string): boolean {
  return !BLOCKED_SUBSTRINGS.some((word) => id.includes(word));
}

/**
 * A fresh image id.
 *
 * Uses nanoid's `customAlphabet`, which does unbiased rejection sampling over
 * the CSPRNG — a hand-rolled `Math.random()` modulo would skew the distribution
 * for any alphabet whose size is not a power of two, and 36 is not.
 *
 * **Claim the id in Postgres before writing the S3 object.** The database's
 * unique constraint is what actually resolves a collision, and it can only do
 * that if the row exists first. Uploading to `original/<id>.<ext>` and *then*
 * inserting means a collision has already overwritten another image's bytes by
 * the time the insert fails.
 */
export function generateImageId(): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    const id = generate();
    if (isAcceptable(id)) return id;
  }
  // Unreachable short of a broken RNG: each draw independently clears the
  // blocklist with probability >99.9%, so 16 consecutive rejections means
  // something is wrong enough that a bad id is not the problem to solve.
  throw new Error("Could not generate an acceptable image id in 16 attempts");
}

const NANOID_PATTERN = /^[0-9a-z]+$/;

/**
 * True for the uuids minted before the nanoid switchover.
 *
 * These are still live primary keys and still name real S3 objects; nothing
 * backfills them. The two formats cannot be confused — a uuid contains hyphens
 * and is 36 characters — which is exactly what lets one text column hold both
 * without a discriminator, and doubles as a marker for which import pipeline
 * produced a row.
 */
export function isLegacyImageId(id: string): boolean {
  return z.uuid().safeParse(id).success;
}

/**
 * Accepts either id format.
 *
 * Every route parameter, server function input, and task payload that takes an
 * image id validates through this, so dropping uuid support once (if ever) the
 * old rows are retired is a single edit here rather than a dozen edits spread
 * across the app.
 */
export const imageIdSchema = z.union([
  z
    .string()
    .regex(NANOID_PATTERN)
    .max(IMAGE_ID_LENGTH * 2),
  z.uuid(),
]);

export type ImageId = z.infer<typeof imageIdSchema>;
