/**
 * Identifying an image format from its magic bytes, with no dependencies.
 *
 * Split out of `codec.ts` because the Worker needs it and cannot have the rest.
 * `codec.ts` reaches for `node:fs` and `createRequire` to load the `@jsquash`
 * WASM modules off disk, neither of which exists on Workers — importing it from
 * a server function would pull all of that into the Worker bundle to get at one
 * eight-byte comparison. This module is plain arithmetic over a `Uint8Array`, so
 * both runtimes can have it.
 *
 * Sniffing rather than trusting a filename is a rule throughout this codebase:
 * a meaningful share of the catalogue is WebP bytes stored under a `.jpg`
 * extension, because the Reddit ingest named files after the URL it fetched them
 * from and i.redd.it serves WebP from `.jpg` paths. A browser's
 * `File.type` is no better — it is derived from the filename on most platforms.
 */

export type ImageFormat = "png" | "jpeg" | "webp";

/** `\x89PNG\r\n\x1a\n`. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let index = start; index < end; index++) {
    out += String.fromCharCode(bytes[index]!);
  }
  return out;
}

/** Identify the format from magic bytes. Null for anything unrecognised. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * The object-key extension for a format.
 *
 * `jpeg` becomes `jpg` because that is what the existing keys use — the derived
 * sizes are written to `jpeg/<size>/<id>.jpg`, and the originals the Reddit
 * ingest saved are `.jpg` too. The format name and the key fragment are
 * different things and this is the only place that converts between them.
 */
export function extensionForFormat(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function contentTypeForFormat(format: ImageFormat): string {
  return `image/${format}`;
}
