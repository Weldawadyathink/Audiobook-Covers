import { encode } from "blurhash";
import sharp from "sharp";

export { isBlurhashValid } from "blurhash";

// https://www.npmjs.com/package/use-next-blurhash

/**
 * Retrieve Image data from url
 */
async function getImage(
  url: string,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const fetchResult = await fetch(url);
  const imageBuffer = await fetchResult.arrayBuffer();
  return sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: "inside" })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      return {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data),
      };
    });
}

/**
 * Generate BlurHash from url
 */
export async function blurhashEncode(url: string) {
  const imageData = await getImage(url);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
  return encode(imageData.data, imageData.width, imageData.height, 4, 4);
}

/**
 * decode BlurHash to image base64
 */
// const blurHashDecode = async (
//   hash,
//   width,
//   height,
//   options = { size: 16, quality: 40 },
// ) => {
//   const hashWidth = options?.size;
//   const hashHeight = Math.round(hashWidth * (height / width));
//   const pixels = decode(hash, hashWidth, hashHeight);
//   const resizedImageBuf = await sharp(Buffer.from(pixels), {
//     raw: { channels: 4, width: hashWidth, height: hashHeight },
//   })
//     .jpeg({ overshootDeringing: true, quality: options.quality })
//     .toBuffer();
//   return `data:image/jpeg;base64,${resizedImageBuf.toString("base64")}`;
// };
