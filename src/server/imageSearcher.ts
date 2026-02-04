import { shapeImageDataArray, shapeImageData } from "@/server/imageData";
import { getDbPool, sql } from "@/server/db";
import { defaultModel, models, zModelOptions } from "@/server/models";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { logAnalyticsEvent } from "@/server/analytics";

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
  logAnalyticsEvent({
    data: {
      eventType: "getRandom",
      payload: {
        results: results.length,
        time: time,
      },
    },
  });
  return await shapeImageDataArray(results);
});

export const getImageByIdAndSimilar = createServerFn({
  method: "GET",
})
  .inputValidator(z.uuid())
  .handler(async ({ data: id }) => {
    console.log(`getImageByIdAndSimilar: ${id}`);
    const start = performance.now();
    const pool = await getDbPool();
    const model = models[defaultModel];
    const target = await pool.maybeOne(
      sql.type(DBImageDataValidator)`
        SELECT
          id,
          source,
          extension,
          blurhash,
          from_old_database,
          searchable
        FROM image
        WHERE id = ${id}
      `,
    );
    if (!target) {
      return [];
    }
    const results = await pool.any(
      sql.type(DBImageDataValidator)`
      WITH searchable_images AS (
        SELECT *
        FROM image
        WHERE searchable IS TRUE
          AND deleted IS FALSE
      ),
      target AS (
        SELECT ${model.dbColumn} as e
        FROM image
        WHERE id = ${id}
          AND deleted IS FALSE
      )
      SELECT
        i.id,
        i.source,
        i.extension,
        i.blurhash,
        i.from_old_database,
        i.searchable,
        i.${model.dbColumn} <=> target.e as distance
      FROM
        searchable_images as i
        CROSS JOIN target
      WHERE i.id != ${id}
      ORDER BY distance
      LIMIT 96
    `,
    );
    const time = performance.now() - start;
    console.log(
      `getImageByIdAnsSimilar database lookup in ${time.toFixed(1)}ms`,
    );
    logAnalyticsEvent({
      data: {
        eventType: "getImageByIdAndSimilar",
        payload: {
          id,
          results: results.length,
          time: time,
        },
      },
    });
    return await shapeImageDataArray([target, ...results]);
  });

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

export const vectorSearchByString = createServerFn()
  .inputValidator(z.object({ q: z.string() }))
  .handler(async ({ data }) => {
    if (data.q === "") {
      return [];
    }
    const modelName = defaultModel;
    const model = models[modelName];
    const similarityThreshold = 0.765;
    const embedStart = performance.now();
    const vector = await model.getTextEmbedding(data.q);
    const dbStart = performance.now();
    const pool = await getDbPool();
    const results = await pool.any(
      sql.type(DBImageDataValidator)`
      WITH searchable_images AS (
        SELECT
          id,
          source,
          extension,
          blurhash,
          from_old_database,
          searchable,
          ${model.dbColumn} <=> ${JSON.stringify(vector.embedding)} as distance
        FROM image
        WHERE searchable IS TRUE
          AND deleted IS FALSE
      )
      SELECT *
      FROM searchable_images
      WHERE distance <= ${similarityThreshold}
      ORDER BY distance
    `,
    );
    const finish = performance.now();
    console.log(
      `Completed search with replicate embedding. Embed time: ${
        dbStart - embedStart
      }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
    );
    logAnalyticsEvent({
      data: {
        eventType: "vectorSearchByString",
        payload: {
          model: modelName,
          q: data.q,
          results: results.length,
          embedTime: dbStart - embedStart,
          dbTime: finish - dbStart,
          totalTime: finish - embedStart,
        },
      },
    });
    return await shapeImageDataArray(results);
  });
