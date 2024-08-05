import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { runSingleClip } from "@/server/utils/clip";
import { db } from "@/server/db";
import { image } from "@/server/db/schema";
import { and, cosineDistance, eq, lte, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export interface ImageData {
  id: string;
  url: string;
  blurhash: string;
  source: string;
}

export interface ImageDataWithRanking extends ImageData {
  similarity: number;
}

// Function to generate output type from db result
function generateImageData(dbData: {
  id: string;
  extension: string | null;
  blurhash: string | null;
  source: string | null;
}): ImageData {
  const url = `https://f001.backblazeb2.com/file/com-audiobookcovers/original/${dbData.id}.${dbData.extension}`;
  return {
    id: dbData.id,
    url: url,
    blurhash: dbData.blurhash!,
    source: dbData.source!,
  };
}

function generateImageDataWithRanking(dbData: {
  id: string;
  extension: string | null;
  blurhash: string | null;
  source: string | null;
  similarity: unknown;
}): ImageDataWithRanking {
  const url = `https://f001.backblazeb2.com/file/com-audiobookcovers/original/${dbData.id}.${dbData.extension}`;
  return {
    id: dbData.id,
    url: url,
    blurhash: dbData.blurhash!,
    source: dbData.source!,
    similarity: dbData.similarity as number,
  };
}

// How similar do items need to be to match
// cosine distance must be under the value
const textSimilarityLevelMap = {
  1: 0.75,
  2: 0.8,
  3: 0.85,
  4: 0.9,
  5: 0.95,
};
const imageSimilarityLevelMap = {
  1: 0.15,
  2: 0.2,
  3: 0.25,
  4: 0.3,
  5: 0.35,
};
// There has to be a better way
const similarityLevel = z.number().int().min(1).max(5).default(1);
export const maxSimilarityLevel = 5;

export const coverRouter = createTRPCRouter({
  getCover: publicProcedure
    // Get cover data from image id
    .input(z.string().trim())
    .query(async ({ input }): Promise<ImageData> => {
      const [result] = await db
        .select({
          id: image.id,
          extension: image.extension,
          blurhash: image.blurhash,
          source: image.source,
        })
        .from(image)
        .where(eq(image.id, input))
        .limit(1);
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return generateImageData(result);
    }),
  getSimilar: publicProcedure
    // Get similar images from image id
    .input(
      z.object({
        id: z.string().trim(),
        similarityThreshold: similarityLevel,
      }),
    )
    .query(async ({ input }): Promise<Array<ImageDataWithRanking>> => {
      // @ts-expect-error Indexing works because of zod validation
      const similarity = imageSimilarityLevelMap[
        input.similarityThreshold
      ] as number;

      const [targetImage] = await db
        .select({
          id: image.id,
          embedding: image.embedding,
        })
        .from(image)
        .where(eq(image.id, input.id))
        .limit(1);
      if (!targetImage) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const sq = db.$with("sq").as(
        db
          .select({
            id: image.id,
            extension: image.extension,
            blurhash: image.blurhash,
            source: image.source,
            similarity: cosineDistance(
              image.embedding,
              targetImage.embedding!,
            ).as("similarity"),
          })
          .from(image)
          .where(and(eq(image.searchable, true), ne(image.id, targetImage.id))),
      );

      const dbResult = await db
        .with(sq)
        .select()
        .from(sq)
        .where(lte(sq.similarity, similarity))
        .orderBy(sq.similarity);

      return dbResult.map(generateImageDataWithRanking);
    }),
  searchByString: publicProcedure
    .input(
      z.object({
        search: z.string().trim().min(1),
        similarityThreshold: similarityLevel,
      }),
    )
    .query(async ({ input }): Promise<Array<ImageDataWithRanking>> => {
      const query = await runSingleClip(input.search);

      // @ts-expect-error Indexing works because of zod validation
      const similarity = textSimilarityLevelMap[
        input.similarityThreshold
      ] as number;

      const sq = db.$with("sq").as(
        db
          .select({
            id: image.id,
            extension: image.extension,
            blurhash: image.blurhash,
            source: image.source,
            similarity: cosineDistance(image.embedding, query.embedding).as(
              "similarity",
            ),
          })
          .from(image)
          .where(eq(image.searchable, true)),
      );

      const dbResult = await db
        .with(sq)
        .select()
        .from(sq)
        .where(lte(sq.similarity, similarity))
        .orderBy(sq.similarity);

      return dbResult.map(generateImageDataWithRanking);
    }),
  getRandom: publicProcedure
    // Get a random selection of covers
    .input(z.object({ n: z.number().int() }))
    .query(async ({ input }): Promise<Array<ImageData>> => {
      // If this query gets too slow, switch to TABLESAMPLE
      const dbResult = await db
        .select({
          id: image.id,
          extension: image.extension,
          blurhash: image.blurhash,
          source: image.source,
        })
        .from(image)
        .where(eq(image.searchable, true))
        .orderBy(sql`random()`)
        .limit(input.n);
      return dbResult.map(generateImageData);
    }),
});
