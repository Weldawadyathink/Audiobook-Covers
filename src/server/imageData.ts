import { getBlurhashUrl } from "@/server/blurhash";
import { decode as decodePng } from "fast-png";
import { extractColors } from "extract-colors";
import { z } from "zod/v4";

function parsePostgresTextArray(value: unknown): unknown {
  if (value == null || Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  if (value === "{}") return [];

  let items: string[];
  try {
    items = JSON.parse(
      `[${value.slice(1, -1).replaceAll("\\\\", "\\").replaceAll('\\"', '"')}]`,
    );
  } catch {
    items = value.slice(1, -1).split(",");
  }

  return items.map((item) => item.replace(/^"|"$/g, "")).filter(Boolean);
}

const nullableStringArray = z.preprocess(
  parsePostgresTextArray,
  z.array(z.string()).nullish(),
);

export const DBImageDataValidator = z.object({
  id: z.uuid(),
  source: z.string(),
  extension: z.string(),
  blurhash: z.string(),
  searchable: z.boolean().optional(),
  score: z.number().nullish(),
  from_old_database: z.boolean().optional(),
  openlibrary_work_id: z.string().nullable(),
  openlibrary_work_id_confidence: z
    .enum(["UNCERTAIN", "LIKELY", "CONFIRMED", "HUMAN", "NO_MATCH"])
    .nullable(),
  openlibrary_title: z.string().nullish(),
  openlibrary_subtitle: z.string().nullish(),
  openlibrary_author_names: nullableStringArray,
  openlibrary_first_publish_year: z.number().int().nullish(),
});

export interface ImageDataBase {
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
  score?: number;
  from_old_database?: boolean;
  primaryColor: Awaited<ReturnType<typeof extractColors>>[number];
  openlibrary?: {
    workId: string;
    confidence: "UNCERTAIN" | "LIKELY" | "CONFIRMED" | "HUMAN";
    title: string | null;
    subtitle: string | null;
    authorNames: string[];
    firstPublishYear: number | null;
    url: string;
  };
}

export type ImageData = ImageDataBase;

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

async function getPrimaryImageColor(
  blurhashUrl: string,
): Promise<ImageData["primaryColor"]> {
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
  image: Readonly<z.infer<typeof DBImageDataValidator>>,
): Promise<ImageData> {
  const blurhashUrl = image.blurhash ? getBlurhashUrl(image.blurhash) : "";
  const primaryColor = await getPrimaryImageColor(blurhashUrl);
  const base: ImageDataBase = {
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
    ...(image.score != null ? { score: image.score } : {}),
    ...(image.from_old_database !== undefined
      ? { from_old_database: image.from_old_database }
      : {}),
  };
  switch (image.openlibrary_work_id_confidence) {
    case "UNCERTAIN":
    case "LIKELY":
    case "CONFIRMED":
    case "HUMAN":
      if (!image.openlibrary_work_id) return base;

      return {
        ...base,
        openlibrary: {
          workId: image.openlibrary_work_id,
          confidence: image.openlibrary_work_id_confidence,
          title: image.openlibrary_title ?? null,
          subtitle: image.openlibrary_subtitle ?? null,
          authorNames: image.openlibrary_author_names ?? [],
          firstPublishYear: image.openlibrary_first_publish_year ?? null,
          url: `https://openlibrary.org/works/${image.openlibrary_work_id}`,
        },
      };
    case "NO_MATCH":
    case undefined:
    default:
      return base;
  }
}

export function shapeImageDataArray(
  data: Readonly<Array<z.infer<typeof DBImageDataValidator>>>,
): Promise<ImageData[]> {
  return Promise.all(data.map(shapeImageData));
}
