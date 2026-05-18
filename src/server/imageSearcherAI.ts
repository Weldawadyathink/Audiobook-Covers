import {
  shapeImageDataArray,
  shapeImageData,
  ImageData,
} from "@/server/imageData";
import { readDb } from "@/server/db.http";
import { getModel, defaultModelName } from "@/server/search/search";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { logAnalyticsEvent } from "@/server/analytics";
import { getReranker } from "@/server/rerankers/rerankers";
import { env } from "@/env.cloudflare";
import { image, openlibrary_work } from "@/db/schema";
import { and, eq, sql as drizzleSql } from "drizzle-orm";

const rrfModelConfig = z.object({
  model: z.string(),
  k: z.number().default(60),
  weight: z.number().default(1),
});

type RRFModelConfig = z.infer<typeof rrfModelConfig>;

export const getRandom = createServerFn().handler(async () => {
  console.log("Getting random cover");
  const start = performance.now();
  const rows = await readDb
    .select({
      id: image.id,
      source: image.source,
      extension: image.extension,
      from_old_database: image.from_old_database,
      blurhash: image.blurhash,
    })
    .from(image)
    .where(and(eq(image.searchable, true), eq(image.deleted, false)))
    .orderBy(drizzleSql`RANDOM()`)
    .limit(54);
  const results = z.array(DBImageDataValidator).parse(rows);
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
    const [targetRow] = await readDb
      .select({
        id: image.id,
        source: image.source,
        extension: image.extension,
        blurhash: image.blurhash,
        from_old_database: image.from_old_database,
        searchable: image.searchable,
        openlibrary_work_id: image.openlibrary_work_id,
        openlibrary_work_id_confidence: image.openlibrary_work_id_confidence,
        openlibrary_title: openlibrary_work.title,
        openlibrary_subtitle: openlibrary_work.subtitle,
        openlibrary_author_names: openlibrary_work.author_names,
        openlibrary_first_publish_year: openlibrary_work.first_publish_year,
      })
      .from(image)
      .leftJoin(
        openlibrary_work,
        eq(openlibrary_work.olid, image.openlibrary_work_id),
      )
      .where(eq(image.id, id))
      .limit(1);
    const target = targetRow ? DBImageDataValidator.parse(targetRow) : null;
    if (!target) {
      return [];
    }

    const model = getModel(defaultModelName);
    const modelColumn = drizzleSql.identifier(model.dbColumn);

    const result = await readDb.execute<z.infer<typeof DBImageDataValidator>>(
      drizzleSql`
      WITH searchable_images AS (
        SELECT *
        FROM image
        WHERE searchable IS TRUE
          AND deleted IS FALSE
      ),
      target AS (
        SELECT ${modelColumn} AS e
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
        i.openlibrary_work_id,
        i.openlibrary_work_id_confidence,
        1 - (${drizzleSql.identifier("i")}.${modelColumn} <=> target.e) as score
      FROM
        searchable_images as i
        CROSS JOIN target
      WHERE i.id != ${id}
      ORDER BY score DESC
      LIMIT 96
    `,
    );
    const results = z.array(DBImageDataValidator).parse(result.rows);
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

  const modelColumn = drizzleSql.identifier(model.dbColumn);
  const result = await readDb.execute<z.infer<typeof DBImageDataValidator>>(
    drizzleSql`
    WITH searchable_images AS (
      SELECT
        id,
        source,
        extension,
        blurhash,
        from_old_database,
        searchable,
        openlibrary_work_id,
        openlibrary_work_id_confidence,
        1 - (${modelColumn} <=> ${JSON.stringify(vector.embedding)}) as score
      FROM image
      WHERE searchable IS TRUE
        AND deleted IS FALSE
    )
    SELECT *
    FROM searchable_images
    WHERE score >= ${similarityThreshold}
    ORDER BY score DESC
    LIMIT 100
  `,
  );
  const results = z.array(DBImageDataValidator).parse(result.rows);
  const timeC = performance.now();
  const final = await shapeImageDataArray(results);

  await logAnalyticsEvent({
    data: {
      eventType: "singleModelSearch",
      payload: {
        appStage: env.APP_STAGE,
        model: modelName,
        q,
        results: final.length,
        modelTime: timeB - timeA,
        databaseTime: timeC - timeB,
        totalTime: timeC - timeA,
      },
    },
  });

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
  const unionParts: ReturnType<typeof drizzleSql>[] = [];

  for (const result of embeddings) {
    if (result.status === "fulfilled") {
      const { config, model, embedding } = result.value;
      const modelColumn = drizzleSql.identifier(model.dbColumn);
      unionParts.push(drizzleSql`(
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY (${modelColumn} <=> ${JSON.stringify(embedding)})) AS rank,
          ${config.k}::float AS k,
          ${config.weight}::float AS weight
        FROM image
        WHERE searchable IS TRUE AND deleted IS FALSE
        LIMIT 100
      )`);
    }
  }

  if (unionParts.length === 0) {
    return [];
  }

  const query = drizzleSql`
    WITH ranked_union AS (
      ${drizzleSql.join(unionParts, drizzleSql` UNION ALL `)}
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
      rrf.rrf_score AS score,
      i.openlibrary_work_id,
      i.openlibrary_work_id_confidence
    FROM rrf
    JOIN image i ON i.id = rrf.id
    ORDER BY rrf_score DESC
    LIMIT 100
  `;

  const result = await readDb.execute<z.infer<typeof DBImageDataValidator>>(
    query,
  );
  const results = z.array(DBImageDataValidator).parse(result.rows);
  const timeC = performance.now();
  const final = await shapeImageDataArray(results);

  await logAnalyticsEvent({
    data: {
      eventType: "multiModelSearch",
      payload: {
        appStage: env.APP_STAGE,
        models: configs.map((c) => c.model),
        q,
        results: final.length,
        modelTime: timeB - timeA,
        databaseTime: timeC - timeB,
        totalTime: timeC - timeA,
      },
    },
  });

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
