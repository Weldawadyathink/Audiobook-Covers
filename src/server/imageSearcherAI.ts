import {
  shapeImageDataArray,
  shapeImageData,
  ImageData,
} from "@/server/imageData";
import { createReadDb } from "@/server/db";
import { getModel, defaultModelName } from "@/server/search/search";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { getReranker } from "@/server/rerankers/rerankers";
import { image, openlibrary_work } from "@/db/schema";
import {
  and,
  desc,
  eq,
  gte,
  ne,
  sql as drizzleSql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cosineDistance } from "drizzle-orm/sql/functions/vector";

const rrfModelConfig = z.object({
  model: z.string(),
  k: z.number().default(60),
  weight: z.number().default(1),
});

type RRFModelConfig = z.infer<typeof rrfModelConfig>;
type WorkerRuntime = {
  env: Cloudflare.Env;
  ctx: ExecutionContext;
};

const embeddingColumnNames = [
  "embedding_andreasjansson_clip",
  "embedding_voyage_multimodal_3_5",
  "embedding_voyage_multimodal_3",
  "embedding_jina_clip_v2",
  "embedding_jina_clip_v2_d32",
  "embedding_jina_embeddings_v4",
  "embedding_jina_embeddings_v4_d128",
] as const;

type EmbeddingColumnName = (typeof embeddingColumnNames)[number];

function getEmbeddingColumn<
  TTable extends Record<EmbeddingColumnName, unknown>,
>(table: TTable, dbColumn: string): TTable[EmbeddingColumnName] {
  if (!embeddingColumnNames.includes(dbColumn as EmbeddingColumnName)) {
    throw new Error(`Unknown embedding column: ${dbColumn}`);
  }
  return table[dbColumn as EmbeddingColumnName];
}

function imageResultSelection<TScore>(score: TScore) {
  return {
    id: image.id,
    source: image.source,
    extension: image.extension,
    blurhash: image.blurhash,
    from_old_database: image.from_old_database,
    searchable: image.searchable,
    score,
    openlibrary_work_id: image.openlibrary_work_id,
    openlibrary_work_id_confidence: image.openlibrary_work_id_confidence,
  };
}

export const getRandom = createServerFn().handler(async ({ context }) => {
  console.log("Getting random cover");
  const start = performance.now();
  const readDb = createReadDb(context!.cloudflare.env);
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
  await captureAnalyticsEvent({
    data: {
      eventType: "getRandom",
      payload: {
        results: results.length,
        time: time,
      },
    },
    env: context!.cloudflare.env,
    ctx: context!.cloudflare.ctx,
  });
  return await shapeImageDataArray(results);
});

export const getImageByIdAndSimilar = createServerFn({
  method: "GET",
})
  .inputValidator(z.uuid())
  .handler(async ({ data: id, context }) => {
    console.log(`getImageByIdAndSimilar: ${id}`);
    const start = performance.now();
    const readDb = createReadDb(context!.cloudflare.env);
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
    const similarImage = alias(image, "i");
    const targetEmbedding = readDb.$with("target_embedding").as(
      readDb
        .select({
          e: getEmbeddingColumn(image, model.dbColumn),
        })
        .from(image)
        .where(and(eq(image.id, id), eq(image.deleted, false))),
    );
    const score = drizzleSql<number>`1 - (${getEmbeddingColumn(
      similarImage,
      model.dbColumn,
    )} <=> ${targetEmbedding.e})`;

    const rows = await readDb
      .with(targetEmbedding)
      .select({
        id: similarImage.id,
        source: similarImage.source,
        extension: similarImage.extension,
        blurhash: similarImage.blurhash,
        from_old_database: similarImage.from_old_database,
        searchable: similarImage.searchable,
        openlibrary_work_id: similarImage.openlibrary_work_id,
        openlibrary_work_id_confidence:
          similarImage.openlibrary_work_id_confidence,
        score: score.as("score"),
      })
      .from(similarImage)
      .crossJoin(targetEmbedding)
      .where(
        and(
          eq(similarImage.searchable, true),
          eq(similarImage.deleted, false),
          ne(similarImage.id, id),
        ),
      )
      .orderBy(desc(score))
      .limit(96);
    const results = z.array(DBImageDataValidator).parse(rows);
    const time = performance.now() - start;
    console.log(
      `getImageByIdAndSimilar database lookup in ${time.toFixed(1)}ms`,
    );
    await captureAnalyticsEvent({
      data: {
        eventType: "getImageByIdAndSimilar",
        payload: {
          id,
          results: results.length,
          time: time,
        },
      },
      env: context!.cloudflare.env,
      ctx: context!.cloudflare.ctx,
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
  runtime: WorkerRuntime,
): Promise<ImageData[]> {
  const model = getModel(modelName);
  const similarityThreshold = 0;

  const timeA = performance.now();
  const vector = await model.getTextEmbedding(q, runtime.env);
  const timeB = performance.now();

  const readDb = createReadDb(runtime.env);
  const score = drizzleSql<number>`1 - (${cosineDistance(
    getEmbeddingColumn(image, model.dbColumn),
    vector.embedding,
  )})`;
  const rows = await readDb
    .select(imageResultSelection(score.as("score")))
    .from(image)
    .where(
      and(
        eq(image.searchable, true),
        eq(image.deleted, false),
        gte(score, similarityThreshold),
      ),
    )
    .orderBy(desc(score))
    .limit(100);
  const results = z.array(DBImageDataValidator).parse(rows);
  const timeC = performance.now();
  const final = await shapeImageDataArray(results);

  await captureAnalyticsEvent({
    data: {
      eventType: "singleModelSearch",
      payload: {
        appStage: runtime.env.APP_STAGE,
        model: modelName,
        q,
        results: final.length,
        modelTime: timeB - timeA,
        databaseTime: timeC - timeB,
        totalTime: timeC - timeA,
      },
    },
    env: runtime.env,
    ctx: runtime.ctx,
  });

  return final;
}

async function multiModelSearch(
  q: string,
  configs: RRFModelConfig[],
  runtime: WorkerRuntime,
): Promise<ImageData[]> {
  // Compute all embeddings in parallel
  const timeA = performance.now();
  const embeddings = await Promise.allSettled(
    configs.map(async (config) => {
      const model = getModel(config.model);
      const output = await model.getTextEmbedding(q, runtime.env);
      return { config, model, embedding: output.embedding };
    }),
  );
  const timeB = performance.now();

  const readDb = createReadDb(runtime.env);
  const rankedQueries: any[] = [];

  for (const result of embeddings) {
    if (result.status === "fulfilled") {
      const { config, model, embedding } = result.value;
      const distance = cosineDistance(
        getEmbeddingColumn(image, model.dbColumn),
        embedding,
      );
      rankedQueries.push(
        readDb
          .select({
            id: image.id,
            rank: drizzleSql<number>`ROW_NUMBER() OVER (ORDER BY ${distance})`.as(
              "rank",
            ),
            k: drizzleSql<number>`${config.k}::float`.as("k"),
            weight: drizzleSql<number>`${config.weight}::float`.as("weight"),
          })
          .from(image)
          .where(and(eq(image.searchable, true), eq(image.deleted, false)))
          .limit(100),
      );
    }
  }

  if (rankedQueries.length === 0) {
    return [];
  }

  const [firstRankedQuery, ...otherRankedQueries] = rankedQueries;
  const rankedUnionQuery = otherRankedQueries.reduce<any>(
    (query, nextQuery) => query.unionAll(nextQuery),
    firstRankedQuery,
  );
  const rankedUnion = readDb.$with("ranked_union").as(rankedUnionQuery);
  const rrf = readDb.$with("rrf").as(
    readDb
      .select({
        id: rankedUnion.id,
        score:
          drizzleSql<number>`SUM(${rankedUnion.weight} / (${rankedUnion.k} + ${rankedUnion.rank}))`.as(
            "rrf_score",
          ),
      })
      .from(rankedUnion)
      .groupBy(rankedUnion.id),
  );

  const rows = await readDb
    .with(rankedUnion, rrf)
    .select(imageResultSelection(rrf.score))
    .from(rrf)
    .innerJoin(image, eq(image.id, rrf.id))
    .orderBy(desc(rrf.score))
    .limit(100);
  const results = z.array(DBImageDataValidator).parse(rows);
  const timeC = performance.now();
  const final = await shapeImageDataArray(results);

  await captureAnalyticsEvent({
    data: {
      eventType: "multiModelSearch",
      payload: {
        appStage: runtime.env.APP_STAGE,
        models: configs.map((c) => c.model),
        q,
        results: final.length,
        modelTime: timeB - timeA,
        databaseTime: timeC - timeB,
        totalTime: timeC - timeA,
      },
    },
    env: runtime.env,
    ctx: runtime.ctx,
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
  .handler(async ({ data, context }) => {
    if (data.q === "") {
      return [];
    }

    if (data.model === undefined) {
      return singleModelSearch(data.q, defaultModelName, context!.cloudflare);
    }
    if (typeof data.model === "string") {
      return singleModelSearch(data.q, data.model, context!.cloudflare);
    }
    const modelConfig = z.array(rrfModelConfig).parse(data.model);
    return multiModelSearch(data.q, modelConfig, context!.cloudflare);
  });
