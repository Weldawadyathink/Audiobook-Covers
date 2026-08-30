/**
 * Generating a blurhash from a decoded image.
 *
 * This is the encoder that used to sit commented out in `src/server/blurhash.ts`
 * waiting on sharp. It does not need sharp: everything that import was there for
 * — decode to raw RGBA, guarantee an alpha channel, resize to fit a 32px box —
 * is what `src/image/codec.ts` already does for the derivative pipeline, so the
 * encoder is now a dozen lines on top of a bitmap the caller has usually decoded
 * anyway.
 *
 * Node-only, because `codec.ts` is. The decode half — turning a stored hash back
 * into a data URL for the browser — stays in `src/server/blurhash.ts`, which the
 * Worker imports.
 */
import { encode } from "blurhash";
import { resizeRgba, type RgbaImage } from "@/image/codec";

/**
 * Longest edge handed to the encoder.
 *
 * Blurhash is a 4x4 cosine fit, so beyond a few dozen pixels the extra input
 * only costs time — it cannot survive into the hash. 32 is what the sharp
 * version used and there is no reason to move it.
 */
const MAX_EDGE = 32;
const COMPONENTS_X = 4;
const COMPONENTS_Y = 4;

/**
 * Encode a blurhash from a full-size bitmap.
 *
 * Scaled to fit inside a 32px box rather than squashed into a square, so the
 * fit is done on the picture's real proportions. Unlike sharp's `fit: "inside"`,
 * an image already smaller than the box is left alone: upscaling first would
 * hand the encoder invented pixels to average.
 */
export function blurhashEncode(image: RgbaImage): string {
  const scale = Math.min(
    MAX_EDGE / image.width,
    MAX_EDGE / image.height,
    // Never enlarge.
    1,
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const small = resizeRgba(image, width, height);

  return encode(
    small.data,
    small.width,
    small.height,
    COMPONENTS_X,
    COMPONENTS_Y,
  );
}
