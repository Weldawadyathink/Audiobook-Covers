import { getBlurhashUrl } from "./blurhash.ts";
import { promisify } from "node:util";
import getPixels from "get-pixels";
import { extractColors } from "extract-colors";

const getPixelsAsync = promisify(getPixels);

export interface DBImageData {
  id: string;
  source: string | null;
  extension: string | null;
  blurhash: string | null;
}

export interface DBImageDataWithDistance extends DBImageData {
  distance: number;
}

export interface ImageData {
  id: string;
  url: string;
  blurhashUrl: string;
  source: string;
  jpeg: {
    320: string;
    640: string;
    1280: string;
  };
  webp: {
    320: string;
    640: string;
    1280: string;
  };
  primaryColor: Awaited<ReturnType<typeof extractColors>>[number];
}

export interface ImageDataWithDistance extends ImageData {
  distance: number;
}

const imageUrlPrefix =
  "https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers";

async function getPrimaryImageColor(blurhashUrl: string) {
  const pixels = await getPixelsAsync(blurhashUrl);
  const data = [...pixels.data];
  const [width, height] = pixels.shape;
  const colors = await extractColors({ data, width, height });
  const color = colors[0];

  // Library uses 0-1, convert to levels compatible with css
  color.hue = color.hue * 360;
  color.saturation = color.saturation * 100;
  color.lightness = color.lightness * 100;
  return colors[0];
}

export function shapeImageData(
  data: Readonly<DBImageDataWithDistance[]>,
): Promise<ImageDataWithDistance[]>;

export function shapeImageData(
  data: Readonly<DBImageData[]>,
): Promise<ImageData[]>;

export async function shapeImageData(
  data: Readonly<DBImageData[]> | Readonly<DBImageDataWithDistance[]>,
): Promise<ImageData[] | ImageDataWithDistance[]> {
  return await Promise.all(data.map(async (image) => {
    const blurhashUrl = image.blurhash ? getBlurhashUrl(image.blurhash) : "";
    const primaryColor = await getPrimaryImageColor(blurhashUrl);
    const returnval: ImageData | ImageDataWithDistance = {
      id: image.id,
      blurhashUrl: blurhashUrl,
      source: image.source || "",
      url: `${imageUrlPrefix}/original/${image.id}.${image.extension}`,
      jpeg: {
        320: `${imageUrlPrefix}/jpeg/320/${image.id}.jpg`,
        640: `${imageUrlPrefix}/jpeg/640/${image.id}.jpg`,
        1280: `${imageUrlPrefix}/jpeg/1280/${image.id}.jpg`,
      },
      webp: {
        320: `${imageUrlPrefix}/webp/320/${image.id}.webp`,
        640: `${imageUrlPrefix}/webp/640/${image.id}.webp`,
        1280: `${imageUrlPrefix}/webp/1280/${image.id}.webp`,
      },
      primaryColor: primaryColor,
    };
    if ("distance" in image) {
      return {
        ...returnval,
        distance: image.distance,
      };
    } else {
      return returnval;
    }
  }));
}
