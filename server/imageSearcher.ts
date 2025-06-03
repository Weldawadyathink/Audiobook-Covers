import { db } from "../db/index.ts";
import { getTextEmbedding } from "./clip.ts";
import { shapeImageData } from "./imageData.ts";
import { image } from "../db/schema.ts";
import { cosineDistance, eq, lte, sql } from "drizzle-orm";

export async function getRandom() {
  console.log("Getting random cover");
  const results = await db
    .select()
    .from(image)
    .orderBy(sql`random()`)
    .limit(24);
  return await shapeImageData(results);
}

export async function getImageById(id: string) {
  console.log(`getById: ${id}`);
  const results = await db
    .select()
    .from(image)
    .where(eq(image.id, id))
    .limit(1);
  return (await shapeImageData(results))[0];
}

export async function vectorSearchByString(query: string) {
  const embedStart = performance.now();
  const vector = await getTextEmbedding(query);
  const dbStart = performance.now();
  const subquery = db.$with("subquery").as(
    db.select({
      id: image.id,
      source: image.source,
      extension: image.extension,
      blurhash: image.blurhash,
      similarity: cosineDistance(
        image.embedding_mobileclip_s1,
        vector.embedding,
      ).as(
        "similarity",
      ),
    })
      .from(image),
  );
  const results = await db
    .with(subquery)
    .select()
    .from(subquery)
    .where(lte(subquery.similarity, 0.5));
  const finish = performance.now();
  console.log(
    `Completed search with replicate embedding. Embed time: ${
      dbStart - embedStart
    }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
  );
  return await shapeImageData(results);
}
