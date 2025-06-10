import { type ImageData, shapeImageData } from "./imageData.ts";
import { pool, sql } from "./db.ts";
import { defaultModel, ModelOptions, models } from "./models.ts";

export async function getRandom() {
  console.log("Getting random cover");
  const start = performance.now();
  const results = await pool.many(
    sql.typeAlias("imageData")`
      SELECT
        id,
        source,
        extension,
        blurhash
      FROM image
      WHERE searchable
      ORDER BY RANDOM()
      LIMIT 54
    `,
  );
  const time = performance.now() - start;
  console.log(`getRandom database lookup in ${time.toFixed(1)}ms`);
  return await shapeImageData(results);
}

export async function getImageById(id: string) {
  console.log(`getById: ${id}`);
  const start = performance.now();
  const results = await pool.maybeOne(
    sql.typeAlias("imageData")`
      SELECT
        id,
        source,
        extension,
        blurhash
      FROM image
      WHERE id=${id}
      LIMIT 1
    `,
  );
  const time = performance.now() - start;
  console.log(`getImageById database lookup in ${time.toFixed(1)}ms`);
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
