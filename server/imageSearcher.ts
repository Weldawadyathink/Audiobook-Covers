import { db } from "../db/index.ts";
import { shapeImageData } from "./imageData.ts";
import { image } from "../db/schema.ts";
import { asc, cosineDistance, desc, eq, gte, lte, sql } from "drizzle-orm";
import { defaultModel, ModelOptions, models } from "./models.ts";

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

export async function vectorSearchByString(
  query: string,
  modelName: ModelOptions = defaultModel,
) {
  const model = models[modelName];
  const embedStart = performance.now();
  const vector = await model.getTextEmbedding(query);
  const dbStart = performance.now();
  const subquery = db.$with("subquery").as(
    db.select({
      id: image.id,
      source: image.source,
      extension: image.extension,
      blurhash: image.blurhash,
      distance: cosineDistance(
        model.dbColumn,
        vector.embedding,
      ).as(
        "distance",
      ),
    })
      .from(image)
      .where(eq(image.searchable, true)),
  );
  const results = await db
    .with(subquery)
    .select()
    .from(subquery)
    .where(lte(subquery.distance, 0.9))
    .orderBy(asc(subquery.distance))
    .limit(24);
  const finish = performance.now();
  console.log(
    `Completed search with replicate embedding. Embed time: ${
      dbStart - embedStart
    }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
  );
  return await shapeImageData(results);
}
