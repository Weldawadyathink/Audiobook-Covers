/**
 * 64-bit DCT perceptual hash, used for duplicate detection.
 *
 * Kept apart from `dedupeImages.ts` so the transform can be exercised without
 * running the script's CLI or touching the database.
 */

/** Side length the image is squashed to before the DCT. */
export const DCT_SIZE = 32;
/** Side length of the retained low-frequency block. 8 x 8 = 64 bits. */
export const HASH_SIZE = 8;

/**
 * Rows of the orthonormal DCT-II basis, precomputed.
 *
 * Only the first `HASH_SIZE` frequencies are ever needed, so this is an 8x32
 * matrix rather than a full 32x32 transform: `basis * pixels * basisᵀ` yields
 * exactly the 8x8 block the hash is built from.
 */
const dctBasis: number[][] = Array.from({ length: HASH_SIZE }, (_, k) => {
  const scale = k === 0 ? Math.sqrt(1 / DCT_SIZE) : Math.sqrt(2 / DCT_SIZE);
  return Array.from(
    { length: DCT_SIZE },
    (_, n) => scale * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * DCT_SIZE)),
  );
});

/**
 * Perceptual hash of a `DCT_SIZE` x `DCT_SIZE` greyscale buffer, as a
 * 64-character bit string ready for a Postgres `bit(64)` column.
 *
 * Each bit records whether one low-frequency DCT coefficient sits above the
 * median of the others. Comparing against a median rather than storing the
 * coefficients is what makes the hash survive rescaling and re-encoding: a
 * coefficient has to cross the median to change the output, which JPEG
 * artefacts and resampling almost never manage.
 */
export function perceptualHash(pixels: Uint8Array): string {
  if (pixels.length !== DCT_SIZE * DCT_SIZE) {
    throw new Error(
      `Expected ${DCT_SIZE * DCT_SIZE} greyscale bytes, got ${pixels.length}`,
    );
  }

  // rows: basis * pixels, giving HASH_SIZE x DCT_SIZE.
  const rows: number[][] = [];
  for (let k = 0; k < HASH_SIZE; k++) {
    const basisRow = dctBasis[k]!;
    const row = new Array<number>(DCT_SIZE);
    for (let x = 0; x < DCT_SIZE; x++) {
      let sum = 0;
      for (let y = 0; y < DCT_SIZE; y++) {
        sum += basisRow[y]! * pixels[y * DCT_SIZE + x]!;
      }
      row[x] = sum;
    }
    rows.push(row);
  }

  // coefficients: rows * basisᵀ, giving HASH_SIZE x HASH_SIZE.
  const coefficients = new Array<number>(HASH_SIZE * HASH_SIZE);
  for (let u = 0; u < HASH_SIZE; u++) {
    const row = rows[u]!;
    for (let v = 0; v < HASH_SIZE; v++) {
      const basisRow = dctBasis[v]!;
      let sum = 0;
      for (let x = 0; x < DCT_SIZE; x++) {
        sum += row[x]! * basisRow[x]!;
      }
      coefficients[u * HASH_SIZE + v] = sum;
    }
  }

  // The DC term is excluded from the median because it carries overall
  // brightness, which is orders of magnitude larger than everything else and
  // would drag the threshold far away from the coefficients being judged.
  const withoutDc = coefficients.slice(1).sort((a, b) => a - b);
  const middle = Math.floor(withoutDc.length / 2);
  const median =
    withoutDc.length % 2 === 0
      ? (withoutDc[middle - 1]! + withoutDc[middle]!) / 2
      : withoutDc[middle]!;

  return coefficients.map((value) => (value > median ? "1" : "0")).join("");
}

/** Number of differing bits between two hashes from `perceptualHash`. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`Hash length mismatch: ${a.length} vs ${b.length}`);
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}
