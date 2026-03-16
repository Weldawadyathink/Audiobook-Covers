import {
  shapeImageDataArray,
  shapeImageData,
  ImageData,
} from "@/server/imageData";
import { getDbReadConnection } from "@/server/db";
import { getModel } from "@/server/models/models";
import { defaultModelName } from "@/shared/modelConstants";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { logAnalyticsEvent } from "@/server/analytics";
import { getReranker } from "@/server/rerankers/rerankers";
import { getEnv } from "@/server/env";
import { waitUntil } from "cloudflare:workers";

const rrfModelConfig = z.object({
  model: z.string(),
  k: z.number().default(60),
  weight: z.number().default(1),
});

type RRFModelConfig = z.infer<typeof rrfModelConfig>;

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

async function singleModelSearch(
  q: string,
  modelName: string,
): Promise<ImageData[]> {
  const model = getModel(modelName);
  const similarityThreshold = 0;

  const timeA = performance.now();
  const vector = await model.getTextEmbedding(q);
  const timeB = performance.now();

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
  const timeC = performance.now();
  const final = await shapeImageDataArray(results);

  await logAnalyticsEvent({
    data: {
      eventType: "singleModelSearch",
      payload: {
        appStage: getEnv().APP_STAGE,
        model: modelName,
        q,
        results: final.length,
        modelTime: timeB - timeA,
        databaseTime: timeC - timeB,
        totalTime: timeC - timeA,
      },
    },
  });

  // Not strictly necessary, but closes all promises so local test runners exit cleanly
  waitUntil(sql.end());
  return final;
}

async function multiModelSearch(
  q: string,
  configs: RRFModelConfig[],
): Promise<ImageData[]> {
  // Compute all embeddings in parallel
  const timeA = performance.now();
  const embeddings = await Promise.allSettled(
    configs.map(async (config) => {
      const model = getModel(config.model);
      const output = await model.getTextEmbedding(q);
      return { config, model, embedding: output.embedding };
    }),
  );
  const timeB = performance.now();

  // Build a dynamic RRF SQL query using UNION ALL + GROUP BY in Postgres.
  // Each model contributes a ranked list; RRF scores are summed per image id.
  const { sql, sqlTools } = getDbReadConnection();

  const unionParts: ReturnType<typeof sql>[] = [];

  for (const result of embeddings) {
    if (result.status === "fulfilled") {
      const { config, model, embedding } = result.value;
      unionParts.push(sql`(
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY (${sql(model.dbColumn)} <=> ${JSON.stringify(embedding)})) AS rank,
          ${config.k}::float AS k,
          ${config.weight}::float AS weight
        FROM image
        WHERE searchable IS TRUE AND deleted IS FALSE
        LIMIT 100
      )`);
    }
  }

  const query = sql`
    WITH ranked_union AS (
      ${unionParts.reduce((acc, part) => sql`${acc} UNION ALL ${part}`)}
    ),
    rrf AS (
      SELECT id, SUM(weight / (k + rank)) AS rrf_score
      FROM ranked_union
      GROUP BY id
    )
    SELECT
      i.id,
      i.source,
      i.extension,
      i.blurhash,
      i.from_old_database,
      i.searchable,
      rrf.rrf_score AS score
    FROM rrf
    JOIN image i ON i.id = rrf.id
    ORDER BY rrf_score DESC
    LIMIT 100
  `;

  const results = await sqlTools.many(DBImageDataValidator)`${query}`;
  const timeC = performance.now();
  const final = await shapeImageDataArray(results);

  await logAnalyticsEvent({
    data: {
      eventType: "multiModelSearch",
      payload: {
        appStage: getEnv().APP_STAGE,
        models: configs.map((c) => c.model),
        q,
        results: final.length,
        modelTime: timeB - timeA,
        databaseTime: timeC - timeB,
        totalTime: timeC - timeA,
      },
    },
  });

  // Not strictly necessary, but closes all promises so local test runners exit cleanly
  waitUntil(sql.end());
  return final;
}

export const vectorSearchByString = createServerFn()
  .inputValidator(
    z.object({
      q: z.string(),
      model: z
        .union([z.string(), z.array(z.string()), z.array(rrfModelConfig)])
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (data.q === "") {
      return [];
    }

    if (data.model === undefined) {
      return singleModelSearch(data.q, defaultModelName);
    }
    if (typeof data.model === "string") {
      return singleModelSearch(data.q, data.model);
    }
    const modelConfig = z.array(rrfModelConfig).parse(data.model);
    return multiModelSearch(data.q, modelConfig);
  });
