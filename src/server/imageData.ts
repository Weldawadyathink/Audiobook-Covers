import { getBlurhashUrl } from "@/server/blurhash";
import { promisify } from "node:util";
import getPixels from "get-pixels";
import { extractColors } from "extract-colors";
import { z } from "zod/v4";

const getPixelsAsync = promisify(getPixels);

export const DBImageDataValidator = z.object({
  id: z.uuid(),
  source: z.string(),
  extension: z.string(),
  blurhash: z.string(),
  searchable: z.stringbool(),
  distance: z.number().optional(),
  from_old_database: z.stringbool().optional(),
});

export interface ImageData {
  id: string;
  url: string;
  blurhashUrl: string;
  source: string;
  searchable?: boolean;
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
  distance?: number;
  from_old_database?: boolean;
  primaryColor: Awaited<ReturnType<typeof extractColors>>[number];
}

const imageUrlPrefix = "https://images.audiobookcovers.com";

async function getPrimaryImageColor(blurhashUrl: string) {
  // TODO: look at https://www.npmjs.com/package/fast-blurhash
  // Gets the average color of a blurhash
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

export async function shapeImageData(
  image: Readonly<z.infer<typeof DBImageDataValidator>>
): Promise<ImageData> {
  const blurhashUrl = image.blurhash ? getBlurhashUrl(image.blurhash) : "";
  const primaryColor = await getPrimaryImageColor(blurhashUrl);
  return {
    id: image.id,
    blurhashUrl,
    source:
      typeof image.source === "string" &&
      image.source.startsWith("https://reddit.com/")
        ? `https://redd.it/${image.source.replace("https://reddit.com/", "")}`
        : (image.source ?? ""),
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
    primaryColor,
    ...(image.searchable !== undefined ? { searchable: image.searchable } : {}),
    ...(image.distance !== undefined ? { distance: image.distance } : {}),
    ...(image.from_old_database !== undefined
      ? { from_old_database: image.from_old_database }
      : {}),
  };
}

export function shapeImageDataArray(
  data: Readonly<Array<z.infer<typeof DBImageDataValidator>>>
): Promise<ImageData[]> {
  return Promise.all(data.map(shapeImageData));
}
