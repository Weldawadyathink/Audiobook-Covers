import {
  type DBImageData,
  getCoverById,
  getCoverWithVectorSearch,
  getRandomCovers,
} from "./db.ts";
import { getTextEmbedding, getTextModel } from "./clip.ts";
import { defaultModel, ModelOptions } from "./models.ts";
import { getBlurhashUrl } from "./blurhash.ts";

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
}

const imageUrlPrefix =
  "https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers";

function shapeImageData(data: DBImageData[]): ImageData[] {
  // Converts database format to frontend compatible format
  // TODO: Add avif format
  return data.map((image): ImageData => {
    return {
      id: image.id,
      blurhashUrl: getBlurhashUrl(image.blurhash),
      source: image.source,
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
    };
  });
}

export async function getRandom() {
  console.log("Getting random cover");
  const data = await getRandomCovers();
  return shapeImageData(data);
}

export async function getImageById(id: string) {
  console.log(`getById: ${id}`);
  const data = await getCoverById(id);
  return shapeImageData([data])[0];
}

export async function vectorSearchByString(query: string) {
  const embedStart = performance.now();
  const vector = await getTextEmbedding(
    query,
    defaultModel,
  );
  const dbStart = performance.now();
  const results = await getCoverWithVectorSearch(
    vector,
    defaultModel,
  );
  const finish = performance.now();
  console.log(
    `Completed search with ${defaultModel}. Embed time: ${
      dbStart - embedStart
    }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
  );
  return shapeImageData(results);
}
