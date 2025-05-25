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
  optimized: string;
}

function shapeImageData(data: DBImageData[]): ImageData[] {
  // Converts database format to frontend compatible format
  return data.map((image): ImageData => {
    return {
      id: image.id,
      blurhashUrl: getBlurhashUrl(image.blurhash),
      source: image.source,
      url:
        `https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers/original/${image.id}.${image.extension}`,
      optimized:
        `https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers/optimized/${image.id}.jpg`,
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
