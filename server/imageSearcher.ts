import {
  // getCoverById,
  // getCoverWithVectorSearch,
  getRandomCovers,
} from "./db.ts";
import { getTextEmbedding } from "./clip.ts";
import { defaultModel } from "./models.ts";
import { shapeImageData } from "./imageData.ts";

export async function getRandom() {
  console.log("Getting random cover");
  const data = await getRandomCovers();
  return await shapeImageData(data);
}

export async function getImageById(id: string) {
  console.log(`getById: ${id}`);
  // const data = await getCoverById(id);
  const data = (await getRandomCovers())[0];
  return (await shapeImageData([data]))[0];
}

export async function vectorSearchByString(query: string) {
  // const embedStart = performance.now();
  // const vector = await getTextEmbedding(
  //   query,
  //   defaultModel,
  // );
  // const dbStart = performance.now();
  // const results = await getCoverWithVectorSearch(
  //   vector,
  //   defaultModel,
  // );
  // const finish = performance.now();
  // console.log(
  //   `Completed search with ${defaultModel}. Embed time: ${
  //     dbStart - embedStart
  //   }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
  // );
  // return await shapeImageData(results);
  return await getRandom();
}
