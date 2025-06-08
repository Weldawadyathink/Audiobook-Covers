import { type ImageData, shapeImageData } from "./imageData.ts";
import { pool, sql } from "./db.ts";
import { defaultModel, ModelOptions, models } from "./models.ts";

export async function getRandom() {
  console.log("Getting random cover");
  const results = await pool.many(
    sql.typeAlias("imageData")`
      SELECT *
      FROM image
      WHERE searchable
      ORDER BY RANDOM()
      LIMIT 54
    `,
  );
  return await shapeImageData(results);
}

export async function getImageById(id: string) {
  console.log(`getById: ${id}`);
  const results = await pool.maybeOne(
    sql.typeAlias("imageData")`
      SELECT *
      FROM image
      WHERE id=${id}
      LIMIT 1
    `,
  );
  if (!results) {
    return;
  }
  return (await shapeImageData([results]))[0];
}

export async function vectorSearchByString(
  query: string,
  modelName: ModelOptions = defaultModel,
) {
  const model = models[modelName];
  const embedStart = performance.now();
  const vector = await model.getTextEmbedding(query);
  const dbStart = performance.now();
  const results = await pool.many(
    sql.typeAlias("imageDataWithDistance")`
      SELECT
        id,
        source,
        extension,
        blurhash,
        ${model.dbColumn} <=> ${JSON.stringify(vector.embedding)} as distance
      FROM image
      WHERE searchable
      ORDER BY distance ASC
      LIMIT 24
    `,
  );
  const finish = performance.now();
  console.log(
    `Completed search with replicate embedding. Embed time: ${
      dbStart - embedStart
    }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
  );
  return await shapeImageData(results);
}
