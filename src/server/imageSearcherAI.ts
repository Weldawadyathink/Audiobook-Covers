import { shapeImageDataArray, ImageData } from "@/server/imageData";
import { createReadDb } from "@/db.cloudflare";
import { getModel, defaultModelName } from "@/searchModels/models";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { image, openlibrary_work } from "@/db/schema";
import { and, desc, eq, gte, ne, sql as drizzleSql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cosineDistance } from "drizzle-orm/sql/functions/vector";
import { env } from "@/env.cloudflare";

function imageResultSelection<TScore>(score: TScore) {
  return {
    id: image.id,
    source: image.source,
    extension: image.extension,
    blurhash: image.blurhash,
    searchable: image.searchable,
    score,
    openlibrary_work_id: image.openlibrary_work_id,
    openlibrary_work_id_confidence: image.openlibrary_work_id_confidence,
  };
}

export const getRandom = createServerFn().handler(async () => {
  console.log("Getting random cover");
  const start = performance.now();
  const readDb = createReadDb();
  const rows = await readDb
    .select({
      id: image.id,
      source: image.source,
      extension: image.extension,
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
    const model = getModel();
    const readDb = createReadDb();
    const [targetRow] = await readDb
      .select({
        id: image.id,
        source: image.source,
        extension: image.extension,
        blurhash: image.blurhash,
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

    const similarImage = alias(image, "i");
    const targetEmbedding = readDb.$with("target_embedding").as(
      readDb
        .select({
          e: image.embedding_jina_clip_v2,
        })
        .from(image)
        .where(and(eq(image.id, id), eq(image.deleted, false))),
    );
    const score = drizzleSql<number>`1 - (${similarImage[model.dbColumn]} <=> ${targetEmbedding.e})`;

    const rows = await readDb
      .with(targetEmbedding)
      .select({
        id: similarImage.id,
        source: similarImage.source,
        extension: similarImage.extension,
        blurhash: similarImage.blurhash,
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
    });
    return await shapeImageDataArray([target, ...results]);
  });

async function singleModelSearch(q: string): Promise<ImageData[]> {
  const model = getModel(defaultModelName);
  const similarityThreshold = 0;

  const timeA = performance.now();
  const vector = await model.getTextEmbedding(q, env);
  const timeB = performance.now();

  const readDb = createReadDb();
  const score = drizzleSql<number>`1 - (${cosineDistance(
    image[model.dbColumn],
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
        appStage: env.APP_STAGE,
        model: defaultModelName,
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
    }),
  )
  .handler(async ({ data }) => {
    if (data.q === "") {
      return [];
    }

    return singleModelSearch(data.q);
  });
