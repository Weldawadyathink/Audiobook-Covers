import { publicProcedure, router } from "../trpc.ts";
import { ModelOptions, models } from "../utils/models.ts";
import {
  type DBImageData,
  getCoverById,
  getCoverWithVectorSearch,
  getRandomCovers,
} from "../utils/db.ts";
import { z } from "zod";
import { getTextEmbedding, getTextModel } from "../utils/clip.ts";

// Preload models into memory
await Promise.all([
  getTextModel("Benny1923/metaclip-b16-fullcc2.5b"),
  getTextModel("Xenova/clip-vit-large-patch14"),
  getTextModel("Xenova/mobileclip_blt"),
]);

export interface ImageData {
  id: string;
  url: string;
  blurhash: string;
  source: string;
  optimized: string;
}

export interface ImageDataWithRanking extends ImageData {
  similarity: number;
}

function shapeImageData(data: DBImageData[]): ImageData[] {
  return data.map((image): ImageData => {
    return {
      id: image.id,
      blurhash: image.blurhash,
      source: image.source,
      url:
        `https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers/original/${image.id}.${image.extension}`,
      optimized:
        `https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers/optimized/${image.id}.jpg`,
    };
  });
}

export const coverRouter = router({
  getRandom: publicProcedure.query(async (): Promise<ImageData[]> => {
    console.log("getting random cover");
    const data = await getRandomCovers();
    return shapeImageData(data);
  }),
  getById: publicProcedure
    .input(z.string().min(1))
    .query(async ({ input }): Promise<ImageData> => {
      console.log(`getById: ${input}`);
      const data = await getCoverById(input);
      return shapeImageData([data])[0];
    }),
  vectorSearchWithString: publicProcedure
    // This stupid TS stuff shouldn't be necessary
    // Oh, it's because Object.keys might return a zero length array
    .input(
      z.object({
        modelName: z.enum(Object.keys(models) as [string, ...string[]]),
        queryString: z.string().trim(),
      }),
    )
    // TODO: add ranking data
    .query(async ({ input }): Promise<ImageData[]> => {
      // console.log(`Starting vector search with ${input.modelName}`);
      const embedStart = performance.now();
      const vector = await getTextEmbedding(
        input.queryString,
        input.modelName as ModelOptions,
      );
      const dbStart = performance.now();
      const results = await getCoverWithVectorSearch(
        vector,
        input.modelName as ModelOptions,
      );
      const finish = performance.now();
      console.log(
        `Completed search with ${input.modelName}. Embed time: ${
          dbStart - embedStart
        }ms, DB time: ${finish - dbStart}ms, Total time: ${
          finish - embedStart
        }ms`,
      );
      return shapeImageData(results);
    }),
});
