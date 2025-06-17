import { shapeImageDataArray } from "@/server/imageData";
import { getDbPool, sql } from "@/server/db";
import { defaultModel, ModelOptions, models } from "@/server/models";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";

export const getRandom = createServerFn().handler(async () => {
  console.log("Getting random cover");
  const start = performance.now();
  const pool = await getDbPool();
  const results = await pool.many(
    sql.type(DBImageDataValidator)`
      SELECT
        id,
        source,
        extension,
        from_old_database,
        blurhash
      FROM image
      WHERE searchable
        AND deleted IS FALSE
      ORDER BY RANDOM()
      LIMIT 54
    `,
  );
  const time = performance.now() - start;
  console.log(`getRandom database lookup in ${time.toFixed(1)}ms`);
  return await shapeImageDataArray(results);
});
//
// export async function getImageByIdAndSimilar(id: string) {
//   // If not found, return empty array
//   console.log(`getImageByIdAndSimilar: ${id}`);
//   const start = performance.now();
//   const pool = await getDbPool();
//   const model = models[defaultModel];
//   const results = await pool.any(
//     sql.type(DBImageDataValidator)`
//       WITH target AS (
//         SELECT ${model.dbColumn} as e
//         FROM image
//         WHERE id = ${id}
//           AND deleted IS FALSE
//       )
//       SELECT
//         i.id,
//         i.source,
//         i.extension,
//         i.blurhash,
//         i.from_old_database,
//         i.searchable,
//         i.${model.dbColumn} <=> target.e as distance
//       FROM
//         image as i
//         CROSS JOIN target
//       WHERE i.deleted IS FALSE
//       ORDER BY distance
//       LIMIT 96
//     `,
//   );
//   const time = performance.now() - start;
//   console.log(`getImageByIdAnsSimilar database lookup in ${time.toFixed(1)}ms`);
//   return await shapeImageDataArray(results);
// }
//
// export async function getImageById(id: string) {
//   console.log(`getImageById: ${id}`);
//   const start = performance.now();
//   const pool = await getDbPool();
//   const results = await pool.maybeOne(
//     sql.type(DBImageDataValidator)`
//       SELECT
//         id,
//         source,
//         extension,
//         blurhash,
//         from_old_database,
//         searchable
//       FROM image
//       WHERE id = ${id}
//         AND deleted IS FALSE
//       LIMIT 1
//     `,
//   );
//   const time = performance.now() - start;
//   console.log(`getImageById database lookup in ${time.toFixed(1)}ms`);
//   if (!results) {
//     return;
//   }
//   return (await shapeImageDataArray([results]))[0];
// }
//
// export async function vectorSearchByString(
//   query: string,
//   modelName: ModelOptions = defaultModel,
// ) {
//   const model = models[modelName];
//   const embedStart = performance.now();
//   const vector = await model.getTextEmbedding(query);
//   const dbStart = performance.now();
//   const pool = await getDbPool();
//   const results = await pool.many(
//     sql.type(DBImageDataValidator)`
//       SELECT
//         id,
//         source,
//         extension,
//         blurhash,
//         from_old_database,
//         searchable,
//         ${model.dbColumn} <=> ${JSON.stringify(vector.embedding)} as distance
//       FROM image
//       WHERE searchable
//         AND deleted IS FALSE
//       ORDER BY distance
//       LIMIT 96
//     `,
//   );
//   const finish = performance.now();
//   console.log(
//     `Completed search with replicate embedding. Embed time: ${
//       dbStart - embedStart
//     }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
//   );
//   return await shapeImageDataArray(results);
// }
