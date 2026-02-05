import { getBlurhashUrl } from "@/server/blurhash";
import { decode as decodePng } from "fast-png";
import { extractColors } from "extract-colors";
import { z } from "zod/v4";

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

const DEFAULT_PRIMARY_COLOR: ImageData["primaryColor"] = {
  hex: "#808080",
  red: 128,
  green: 128,
  blue: 128,
  hue: 0,
  saturation: 0,
  lightness: 50,
  intensity: 0.5,
  area: 1,
};

async function getPrimaryImageColor(blurhashUrl: string): Promise<ImageData["primaryColor"]> {
  if (!blurhashUrl) return DEFAULT_PRIMARY_COLOR;

  const base64 = blurhashUrl.split(",")[1];
  if (!base64) return DEFAULT_PRIMARY_COLOR;

  const binary = atob(base64);
  const pngBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pngBytes[i] = binary.charCodeAt(i);

  const decoded = decodePng(pngBytes);
  const data = [...decoded.data];
  const colors = await extractColors({
    data,
    width: decoded.width,
    height: decoded.height,
  });
  const color = colors[0];

  // Library uses 0-1, convert to levels compatible with css
  color.hue = color.hue * 360;
  color.saturation = color.saturation * 100;
  color.lightness = color.lightness * 100;
  return color;
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
