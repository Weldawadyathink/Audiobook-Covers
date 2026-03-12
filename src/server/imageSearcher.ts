import { shapeImageDataArray, shapeImageData } from "@/server/imageData";
import { getDbReadConnection } from "@/server/db";
import { getModel } from "@/server/models/models";
import { defaultModelName } from "@/shared/modelConstants";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { logAnalyticsEvent } from "@/server/analytics";
import { getReranker } from "@/server/rerankers/rerankers";
import { getEnv } from "@/server/env";

export const getRandom = createServerFn().handler(async () => {
  console.log("Getting random cover");
  const start = performance.now();
  const { sqlTools } = getDbReadConnection();
  const results = await sqlTools.many(DBImageDataValidator)`
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
  `;
  const time = performance.now() - start;
  console.log(`getRandom database lookup in ${time.toFixed(1)}ms`);
  await logAnalyticsEvent({
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
    const { sqlTools, sql } = getDbReadConnection();
    const target = await sqlTools.maybeOne(DBImageDataValidator)`
      SELECT
        id,
        source,
        extension,
        blurhash,
        from_old_database,
        searchable
      FROM image
      WHERE id = ${id}
    `;
    if (!target) {
      return [];
    }

    const model = getModel(defaultModelName);

    const results = await sqlTools.many(DBImageDataValidator)`
      WITH searchable_images AS (
        SELECT *
        FROM image
        WHERE searchable IS TRUE
          AND deleted IS FALSE
      ),
      target AS (
        SELECT ${sql(model.dbColumn)} AS e
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
        1 - (i.${sql(model.dbColumn)} <=> target.e) as score
      FROM
        searchable_images as i
        CROSS JOIN target
      WHERE i.id != ${id}
      ORDER BY score DESC
      LIMIT 96
    `;
    const time = performance.now() - start;
    console.log(
      `getImageByIdAndSimilar database lookup in ${time.toFixed(1)}ms`,
    );
    await logAnalyticsEvent({
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
  .inputValidator(
    z.object({
      q: z.string(),
      model: z.string().optional(),
      reranker: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (data.q === "") {
      return [];
    }
    const modelName = data.model ?? defaultModelName;
    const model = getModel(modelName);
    const similarityThreshold = 0;
    const embedStart = performance.now();
    const vector = await model.getTextEmbedding(data.q);
    const dbStart = performance.now();
    const { sql, sqlTools } = getDbReadConnection();
    const results = await sqlTools.many(DBImageDataValidator)`
      WITH searchable_images AS (
        SELECT
          id,
          source,
          extension,
          blurhash,
          from_old_database,
          searchable,
          1 - (${sql(model.dbColumn)} <=> ${JSON.stringify(vector.embedding)}) as score
        FROM image
        WHERE searchable IS TRUE
          AND deleted IS FALSE
      )
      SELECT *
      FROM searchable_images
      WHERE score >= ${similarityThreshold}
      ORDER BY score DESC
      LIMIT 100
    `;

    const finish = performance.now();
    console.log(
      `Completed search with replicate embedding. Embed time: ${
        dbStart - embedStart
      }ms, DB time: ${finish - dbStart}ms, Total time: ${finish - embedStart}ms`,
    );
    const shapedResults = await shapeImageDataArray(results);
    let finalResults = shapedResults;

    const reranker = getReranker(data.reranker);
    let rerankerTime: number | undefined;

    if (reranker) {
      const rerankerStart = performance.now();
      finalResults = await reranker.rerank(data.q, shapedResults);
      rerankerTime = performance.now() - rerankerStart;
      console.log(
        `Reranker (${data.reranker}) time: ${rerankerTime.toFixed(1)}ms`,
      );
    }

    await logAnalyticsEvent({
      data: {
        eventType: "vectorSearchByString",
        payload: {
          appStage: getEnv().APP_STAGE,
          model: modelName,
          reranker: data.reranker ?? null,
          q: data.q,
          results: results.length,
          embedTime: dbStart - embedStart,
          dbTime: finish - dbStart,
          rerankerTime: rerankerTime ?? null,
          totalTime: finish - embedStart + (rerankerTime || 0),
        },
      },
    });
    return finalResults;
  });
