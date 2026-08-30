/**
 * Decoding, resizing and re-encoding cover images.
 *
 * Pure JavaScript and WASM on purpose, for the same reason as
 * `src/image/imagePixels.ts`: sharp drags in a native binary that has to match
 * the platform and be rebuilt on install, and this repo has deliberately stayed
 * free of that. The cost is speed, which does not matter for a per-image
 * background job.
 *
 * The format is sniffed from the file's magic bytes, never taken from
 * `image.extension`. Those two disagree in the catalogue: the Reddit ingest
 * named files after the URL it fetched them from, and i.redd.it happily serves
 * WebP bytes from a path ending in `.jpg`, so there are WebP originals filed
 * under a jpg extension. `extension` is still the right thing to build the
 * object key from — it is part of the key — but it says nothing about what is
 * inside.
 *
 * Node-only: the WASM codecs are read off disk. Nothing here may be imported by
 * Worker code.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decode as decodeJpeg, encode as encodeJpegBuffer } from "jpeg-js";
import { convertIndexedToRgb, decode as decodePng } from "fast-png";
import decodeWebpBuffer, { init as initWebpDecode } from "@jsquash/webp/decode";
import encodeWebpBuffer, { init as initWebpEncode } from "@jsquash/webp/encode";
import encodePngBuffer, { init as initPngEncode } from "@jsquash/png/encode";
import optimisePng, { init as initOxipng } from "@jsquash/oxipng/optimise";
import { simd } from "wasm-feature-detect";

/**
 * Format sniffing lives in `sniff.ts` and is re-exported here.
 *
 * Callers already import it from this module, and the Worker cannot import this
 * module at all — see the note at the top of `sniff.ts`.
 */
import { sniffFormat, type ImageFormat } from "@/image/sniff";

export { sniffFormat, type ImageFormat };

/** oxipng's own default. See the measurement in `encodePng`. */
const OXIPNG_LEVEL = 2;

/** Straight (not premultiplied) RGBA, row-major, 8 bits per channel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DecodedRgbaImage extends RgbaImage {
  /** What the bytes actually turned out to be, whatever the extension claimed. */
  format: ImageFormat;
}

/**
 * The WebP codecs are WASM and have to be handed their module explicitly.
 *
 * `@jsquash` is built for browsers, where the codec is fetched over HTTP; in
 * Node that fetch fails, so the compiled module is loaded from disk once and
 * shared by every later call.
 */
const require = createRequire(import.meta.url);

function compileWasm(specifier: string) {
  return WebAssembly.compile(readFileSync(require.resolve(specifier)));
}

let webpDecodeReady: Promise<void> | undefined;
function ensureWebpDecodeReady() {
  webpDecodeReady ??= (async () => {
    await initWebpDecode(
      await compileWasm("@jsquash/webp/codec/dec/webp_dec.wasm"),
    );
  })();
  return webpDecodeReady;
}

let webpEncodeReady: Promise<unknown> | undefined;
function ensureWebpEncodeReady() {
  webpEncodeReady ??= (async () => {
    // The encoder picks the SIMD build when the runtime supports it, and a
    // precompiled module only instantiates against the variant it was built
    // from. Detecting the same way the encoder does is what keeps the two in
    // step; hand it the wrong `.wasm` and instantiation fails on an import
    // mismatch rather than falling back.
    const specifier = (await simd())
      ? "@jsquash/webp/codec/enc/webp_enc_simd.wasm"
      : "@jsquash/webp/codec/enc/webp_enc.wasm";
    return await initWebpEncode(await compileWasm(specifier));
  })();
  return webpEncodeReady;
}

let pngEncodeReady: Promise<unknown> | undefined;
function ensurePngEncodeReady() {
  pngEncodeReady ??= (async () => {
    await initPngEncode(
      await compileWasm("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"),
    );
    return await initOxipng(
      await compileWasm("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    );
  })();
  return pngEncodeReady;
}

function decodePngToRgba(buffer: Buffer): DecodedRgbaImage {
  const png = decodePng(buffer);
  const pixels = png.width * png.height;
  const data = new Uint8ClampedArray(pixels * 4);

  if (png.palette) {
    const rgb = convertIndexedToRgb(png);
    // Three channels normally, four when a tRNS chunk gave the palette alpha.
    const stride = rgb.length / pixels;
    for (let i = 0; i < pixels; i++) {
      const at = i * stride;
      const out = i * 4;
      data[out] = rgb[at]!;
      data[out + 1] = rgb[at + 1]!;
      data[out + 2] = rgb[at + 2]!;
      data[out + 3] = stride === 4 ? rgb[at + 3]! : 255;
    }
    return { width: png.width, height: png.height, format: "png", data };
  }

  // 16-bit channels are scaled back to the 0-255 range everything else assumes.
  const scale = png.depth === 16 ? 1 / 257 : 1;
  const channels = png.channels;
  for (let i = 0; i < pixels; i++) {
    const at = i * channels;
    const out = i * 4;
    if (channels <= 2) {
      // Greyscale, optionally with an alpha channel after it.
      const grey = png.data[at]! * scale;
      data[out] = grey;
      data[out + 1] = grey;
      data[out + 2] = grey;
      data[out + 3] = channels === 2 ? png.data[at + 1]! * scale : 255;
    } else {
      data[out] = png.data[at]! * scale;
      data[out + 1] = png.data[at + 1]! * scale;
      data[out + 2] = png.data[at + 2]! * scale;
      data[out + 3] = channels === 4 ? png.data[at + 3]! * scale : 255;
    }
  }
  return { width: png.width, height: png.height, format: "png", data };
}

function decodeJpegToRgba(buffer: Buffer): DecodedRgbaImage {
  const jpeg = decodeJpeg(buffer, { useTArray: true, formatAsRGBA: true });
  return {
    width: jpeg.width,
    height: jpeg.height,
    format: "jpeg",
    data: new Uint8ClampedArray(
      jpeg.data.buffer,
      jpeg.data.byteOffset,
      jpeg.data.byteLength,
    ),
  };
}

async function decodeWebpToRgba(buffer: Buffer): Promise<DecodedRgbaImage> {
  await ensureWebpDecodeReady();
  const decoded = await decodeWebpBuffer(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer,
  );
  return {
    width: decoded.width,
    height: decoded.height,
    format: "webp",
    data: new Uint8ClampedArray(
      decoded.data.buffer,
      decoded.data.byteOffset,
      decoded.data.byteLength,
    ),
  };
}

export async function decodeToRgba(buffer: Buffer): Promise<DecodedRgbaImage> {
  switch (sniffFormat(buffer)) {
    case "png":
      return decodePngToRgba(buffer);
    case "jpeg":
      return decodeJpegToRgba(buffer);
    case "webp":
      return await decodeWebpToRgba(buffer);
    default:
      throw new Error(
        `Unrecognised image format, first bytes ${buffer.subarray(0, 8).toString("hex")}`,
      );
  }
}

/**
 * Area-average resize.
 *
 * Every source pixel contributes in proportion to how much of the target pixel
 * it covers. For the downscales this job produces that is the right filter:
 * it cannot alias, and unlike a fixed-radius kernel it does not need a separate
 * decision about support width per scale factor.
 *
 * Colour is averaged premultiplied by alpha, so a fully transparent pixel
 * contributes its transparency but not its (arbitrary) colour. Straight
 * averaging is the classic source of dark halos around anti-aliased edges.
 */
export function resizeRgba(
  image: RgbaImage,
  targetWidth: number,
  targetHeight: number,
): RgbaImage {
  const { width, height, data } = image;
  if (targetWidth === width && targetHeight === height) return image;

  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const cellWidth = width / targetWidth;
  const cellHeight = height / targetHeight;

  for (let ty = 0; ty < targetHeight; ty++) {
    const top = ty * cellHeight;
    const bottom = (ty + 1) * cellHeight;
    const firstRow = Math.floor(top);
    const lastRow = Math.min(Math.ceil(bottom), height);

    for (let tx = 0; tx < targetWidth; tx++) {
      const left = tx * cellWidth;
      const right = (tx + 1) * cellWidth;
      const firstColumn = Math.floor(left);
      const lastColumn = Math.min(Math.ceil(right), width);

      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let weight = 0;

      for (let sy = firstRow; sy < lastRow; sy++) {
        const rowWeight = Math.min(bottom, sy + 1) - Math.max(top, sy);
        if (rowWeight <= 0) continue;
        const rowStart = sy * width;

        for (let sx = firstColumn; sx < lastColumn; sx++) {
          const columnWeight = Math.min(right, sx + 1) - Math.max(left, sx);
          if (columnWeight <= 0) continue;
          const area = rowWeight * columnWeight;
          const at = (rowStart + sx) * 4;
          const sourceAlpha = data[at + 3]!;
          const premultiplied = (area * sourceAlpha) / 255;

          red += data[at]! * premultiplied;
          green += data[at + 1]! * premultiplied;
          blue += data[at + 2]! * premultiplied;
          alpha += sourceAlpha * area;
          weight += area;
        }
      }

      const to = (ty * targetWidth + tx) * 4;
      if (weight <= 0) continue;
      const averageAlpha = alpha / weight;
      // Undo the premultiply. A cell that is entirely transparent has no colour
      // to recover, and leaving it at zero is correct rather than a shortcut.
      const unweight = averageAlpha > 0 ? weight * (averageAlpha / 255) : 0;
      if (unweight > 0) {
        out[to] = red / unweight;
        out[to + 1] = green / unweight;
        out[to + 2] = blue / unweight;
      }
      out[to + 3] = averageAlpha;
    }
  }

  return { width: targetWidth, height: targetHeight, data: out };
}

/**
 * JPEG has no alpha channel. jpeg-js simply ignores the fourth byte, which
 * leaves whatever RGB happened to sit under a transparent pixel — usually
 * black, occasionally noise. Compositing onto white first is what makes a
 * transparent-background PNG cover come out looking like the page it will be
 * shown on rather than a black rectangle.
 */
export function encodeJpeg(image: RgbaImage, quality: number): Buffer {
  const pixels = image.width * image.height;
  const flattened = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const at = i * 4;
    const alpha = image.data[at + 3]! / 255;
    const background = 255 * (1 - alpha);
    flattened[at] = image.data[at]! * alpha + background;
    flattened[at + 1] = image.data[at + 1]! * alpha + background;
    flattened[at + 2] = image.data[at + 2]! * alpha + background;
    flattened[at + 3] = 255;
  }

  return encodeJpegBuffer(
    { data: flattened, width: image.width, height: image.height },
    quality,
  ).data;
}

/**
 * Lossless PNG, alpha preserved.
 *
 * Two passes, because the encoder and the optimiser are different jobs: Squoosh's
 * PNG encoder is fast and indifferent to size, and oxipng then re-derives the
 * filter and deflate choices it did not bother searching for. Measured over
 * three real covers at 909-1280px, oxipng at level 2 takes 25-45% off the
 * encoder's output for about a second of CPU — worth it for an archival object
 * written once and served forever.
 *
 * `fast-png`, already a dependency and used above for decoding, was measured
 * against this: within ~10% of the raw encoder either way, but 10x slower and
 * with no optimiser to pair with, so it loses on both axes that matter here.
 *
 * A word of warning on expectations: a photographic cover is 4-7x *larger* as
 * PNG than as the JPEG or WebP it came from — 2-3MB is typical at 1280px. That
 * is PNG working correctly, not a bad setting. This format is for the lossless
 * copy, never for what the browser downloads.
 */
export async function encodePng(image: RgbaImage): Promise<Buffer> {
  await ensurePngEncodeReady();
  const encoded = await encodePngBuffer({
    data: image.data,
    width: image.width,
    height: image.height,
  } as ImageData);
  return Buffer.from(await optimisePng(encoded, { level: OXIPNG_LEVEL }));
}

export async function encodeWebp(
  image: RgbaImage,
  quality: number,
): Promise<Buffer> {
  await ensureWebpEncodeReady();
  const encoded = await encodeWebpBuffer(
    { data: image.data, width: image.width, height: image.height } as ImageData,
    { quality },
  );
  return Buffer.from(encoded);
}
