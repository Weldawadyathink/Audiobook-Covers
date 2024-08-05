// Originally from https://gist.github.com/oleggrishechkin/95483267a0b242e0004cbd5d5138c732
import { decode } from "blurhash";
import { useMemo } from "react";

export function useBlurhashUrl(blurhash: string) {
  return useMemo(() => getBlurhashUrl(blurhash), [blurhash]);
}

export function getBlurhashUrl(inputHash: string) {
  // source of code below https://github.com/wheany/js-png-encoder/blob/master/generatepng.js
  const DEFLATE_METHOD = String.fromCharCode(0x78, 0x01);
  const CRC_TABLE: number[] = [];
  const SIGNATURE = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
  const NO_FILTER = String.fromCharCode(0);

  const makeCrcTable = () => {
    let c;

    for (let n = 0; n < 256; n++) {
      c = n;

      for (let k = 0; k < 8; k++) {
        if (c & 1) {
          c = 0xedb88320 ^ (c >>> 1);
        } else {
          c = c >>> 1;
        }
      }

      CRC_TABLE[n] = c;
    }
  };

  makeCrcTable();

  const inflateStore = (data: string) => {
    const MAX_STORE_LENGTH = 65535;
    let storeBuffer = "";
    let remaining;
    let blockType;

    for (let i = 0; i < data.length; i += MAX_STORE_LENGTH) {
      remaining = data.length - i;
      blockType = "";

      if (remaining <= MAX_STORE_LENGTH) {
        blockType = String.fromCharCode(0x01);
      } else {
        remaining = MAX_STORE_LENGTH;
        blockType = String.fromCharCode(0x00);
      }

      // little-endian
      storeBuffer +=
        blockType +
        String.fromCharCode(remaining & 0xff, (remaining & 0xff00) >>> 8);
      storeBuffer += String.fromCharCode(
        ~remaining & 0xff,
        (~remaining & 0xff00) >>> 8,
      );

      storeBuffer += data.substring(i, i + remaining);
    }

    return storeBuffer;
  };

  const adler32 = (data: string) => {
    const MOD_ADLER = 65521;
    let a = 1;
    let b = 0;

    for (let i = 0; i < data.length; i++) {
      a = (a + data.charCodeAt(i)) % MOD_ADLER;
      b = (b + a) % MOD_ADLER;
    }

    return (b << 16) | a;
  };

  const updateCrc = (crc: number, buf: string) => {
    let c = crc;
    let b: number;

    for (let n = 0; n < buf.length; n++) {
      b = buf.charCodeAt(n);
      // @ts-expect-error idk I just trust the author
      c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    }

    return c;
  };

  const crc = (buf: string) => updateCrc(0xffffffff, buf) ^ 0xffffffff;

  const dwordAsString = (dword: number) =>
    String.fromCharCode(
      (dword & 0xff000000) >>> 24,
      (dword & 0x00ff0000) >>> 16,
      (dword & 0x0000ff00) >>> 8,
      dword & 0x000000ff,
    );

  const createChunk = (length: number, type: string, data: string) => {
    const CRC = crc(type + data);

    return dwordAsString(length) + type + data + dwordAsString(CRC);
  };

  const IEND = createChunk(0, "IEND", "");

  const createIHDR = (width: number, height: number) => {
    const IHDRdata =
      dwordAsString(width) +
      dwordAsString(height) +
      // bit depth
      String.fromCharCode(8) +
      // color type: 6=truecolor with alpha
      String.fromCharCode(6) +
      // compression method: 0=deflate, only allowed value
      String.fromCharCode(0) +
      // filtering: 0=adaptive, only allowed value
      String.fromCharCode(0) +
      // interlacing: 0=none
      String.fromCharCode(0);

    return createChunk(13, "IHDR", IHDRdata);
  };

  const png = (width: number, height: number, rgba: Uint8ClampedArray) => {
    const IHDR = createIHDR(width, height);
    let scanlines = "";

    for (let y = 0; y < rgba.length; y += width * 4) {
      scanlines += NO_FILTER;

      for (let x = 0; x < width * 4; x++) {
        // @ts-expect-error idk I just trust the author
        scanlines += String.fromCharCode(rgba[y + x] & 0xff);
      }
    }

    const compressedScanlines =
      DEFLATE_METHOD +
      inflateStore(scanlines) +
      dwordAsString(adler32(scanlines));
    const IDAT = createChunk(
      compressedScanlines.length,
      "IDAT",
      compressedScanlines,
    );

    return SIGNATURE + IHDR + IDAT + IEND;
  };

  // this is a fork of https://gist.github.com/mattiaz9/53cb67040fa135cb395b1d015a200aff
  const getPngArray = (pngString: string) => {
    const pngArray = new Uint8Array(pngString.length);

    for (let i = 0; i < pngString.length; i++) {
      pngArray[i] = pngString.charCodeAt(i);
    }

    return pngArray;
  };

  const blurHashToDataURL = (hash: string, width = 32, height = 32) => {
    const rgba = decode(hash, width, height);
    const pngString = png(width, height, rgba);
    const base64 =
      typeof window === "undefined"
        ? Buffer.from(getPngArray(pngString)).toString("base64")
        : btoa(pngString);

    return `data:image/png;base64,${base64}`;
  };

  return blurHashToDataURL(inputHash);
}
// End external source code
