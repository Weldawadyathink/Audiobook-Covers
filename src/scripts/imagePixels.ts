/**
 * Decoding an image file down to the small greyscale square the hash needs.
 *
 * Pure JavaScript on purpose. sharp would be the obvious choice, but it drags
 * in a native binary that has to match the platform and be rebuilt on install,
 * and this repo has deliberately stayed free of that — `src/server/blurhash.ts`
 * still carries a commented-out sharp import from the last attempt. The only
 * formats in `image.extension` are jpg, jpeg and png, both of which decode fine
 * in JS, so the dependency buys nothing here.
 */
import { decode as decodeJpeg } from "jpeg-js";
import {
  convertIndexedToRgb,
  decode as decodePng,
  hasPngSignature,
} from "fast-png";

export interface DecodedImage {
  width: number;
  height: number;
  /** One luma sample per pixel, row-major. */
  luma: Float32Array;
}

/** ITU-R BT.601 luma, the same weighting Pillow's "L" conversion uses. */
function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function decodePngToLuma(buffer: Buffer): DecodedImage {
  const png = decodePng(buffer);
  const luma = new Float32Array(png.width * png.height);

  if (png.palette) {
    const rgb = convertIndexedToRgb(png);
    // Three channels normally, four when a tRNS chunk gave the palette alpha.
    const stride = rgb.length / luma.length;
    for (let i = 0; i < luma.length; i++) {
      const at = i * stride;
      luma[i] = luminance(rgb[at]!, rgb[at + 1]!, rgb[at + 2]!);
    }
    return { width: png.width, height: png.height, luma };
  }

  // 16-bit channels are scaled back to the 0-255 range the hash assumes.
  const scale = png.depth === 16 ? 1 / 257 : 1;
  const channels = png.channels;
  for (let i = 0; i < luma.length; i++) {
    const at = i * channels;
    luma[i] =
      channels <= 2
        ? png.data[at]! * scale
        : luminance(
            png.data[at]! * scale,
            png.data[at + 1]! * scale,
            png.data[at + 2]! * scale,
          );
  }
  return { width: png.width, height: png.height, luma };
}

function decodeJpegToLuma(buffer: Buffer): DecodedImage {
  const jpeg = decodeJpeg(buffer, { useTArray: true, formatAsRGBA: false });
  const luma = new Float32Array(jpeg.width * jpeg.height);
  for (let i = 0; i < luma.length; i++) {
    const at = i * 3;
    luma[i] = luminance(jpeg.data[at]!, jpeg.data[at + 1]!, jpeg.data[at + 2]!);
  }
  return { width: jpeg.width, height: jpeg.height, luma };
}

export function decodeImage(buffer: Buffer): DecodedImage {
  return hasPngSignature(buffer)
    ? decodePngToLuma(buffer)
    : decodeJpegToLuma(buffer);
}

/**
 * Area-average downscale to a `size` x `size` greyscale square.
 *
 * Every source pixel contributes in proportion to how much of the target cell
 * it covers, so the result depends on the picture rather than on the source
 * dimensions — which is the whole property the hash relies on when the same
 * cover shows up at two resolutions. A resampling filter with a wider support
 * (Lanczos and friends) would sharpen slightly differently at each input size
 * and reintroduce exactly the drift this avoids.
 *
 * The square is filled rather than fitted: the hash has to describe the whole
 * image, and letterboxing to preserve aspect would encode the padding instead.
 */
export function downscaleToSquare(
  image: DecodedImage,
  size: number,
): Uint8Array {
  const { width, height, luma } = image;
  const out = new Uint8Array(size * size);
  const cellWidth = width / size;
  const cellHeight = height / size;

  for (let ty = 0; ty < size; ty++) {
    const top = ty * cellHeight;
    const bottom = (ty + 1) * cellHeight;
    const firstRow = Math.floor(top);
    const lastRow = Math.min(Math.ceil(bottom), height);

    for (let tx = 0; tx < size; tx++) {
      const left = tx * cellWidth;
      const right = (tx + 1) * cellWidth;
      const firstColumn = Math.floor(left);
      const lastColumn = Math.min(Math.ceil(right), width);

      let total = 0;
      let weight = 0;
      for (let sy = firstRow; sy < lastRow; sy++) {
        const rowWeight = Math.min(bottom, sy + 1) - Math.max(top, sy);
        if (rowWeight <= 0) continue;
        const rowStart = sy * width;
        for (let sx = firstColumn; sx < lastColumn; sx++) {
          const columnWeight = Math.min(right, sx + 1) - Math.max(left, sx);
          if (columnWeight <= 0) continue;
          const area = rowWeight * columnWeight;
          total += luma[rowStart + sx]! * area;
          weight += area;
        }
      }
      out[ty * size + tx] = weight > 0 ? Math.round(total / weight) : 0;
    }
  }

  return out;
}
