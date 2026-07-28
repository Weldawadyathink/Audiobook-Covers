import { shapeImageDataArray, ImageData } from "@/server/imageData";
import { createReadDb } from "@/db.cloudflare";
import { getModel, defaultModelName } from "@/searchModels/models";
import { getReranker } from "@/server/rerankers/rerankers";
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

/** The OpenLibrary columns the UI needs to caption a cover with its book. */
const openlibraryWorkSelection = {
  openlibrary_title: openlibrary_work.title,
  openlibrary_subtitle: openlibrary_work.subtitle,
  openlibrary_author_names: openlibrary_work.author_names,
  openlibrary_first_publish_year: openlibrary_work.first_publish_year,
};

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

export interface ImageDetail {
  /** The cover the page is about, or null when the id matches nothing. */
  image: ImageData | null;
  /** Other covers uploaded for the same OpenLibrary work. */
  sameBook: ImageData[];
  /** Covers for *different* books by any of this book's authors. */
  sameAuthor: ImageData[];
  /** Visually similar covers, regardless of which book they belong to. */
  similar: ImageData[];
}

const EMPTY_DETAIL: ImageDetail = {
  image: null,
  sameBook: [],
  sameAuthor: [],
  similar: [],
};

/** `text[]` literal for an `&&` overlap test, built one bound param per name. */
function textArray(values: readonly string[]) {
  return drizzleSql`ARRAY[${drizzleSql.join(
    values.map((value) => drizzleSql`${value}`),
    drizzleSql`, `,
  )}]::text[]`;
}

type ReadDb = ReturnType<typeof createReadDb>;

/** Every other cover uploaded for the same OpenLibrary work. */
async function getSameBookCovers(readDb: ReadDb, id: string, olid: string) {
  const rows = await readDb
    .select(imageResultSelection(drizzleSql<number | null>`NULL`.as("score")))
    .from(image)
    .where(
      and(
        eq(image.openlibrary_work_id, olid),
        ne(image.id, id),
        eq(image.searchable, true),
        eq(image.deleted, false),
      ),
    )
    .orderBy(image.id)
    .limit(24);
  return z.array(DBImageDataValidator).parse(rows);
}

/**
 * Covers for other books by the same author(s).
 *
 * Matching is on `author_names` overlap rather than an author id because
 * `openlibrary_work` stores names only. Works are ordered by `edition_count` so
 * the author's better-known books surface first.
 */
async function getSameAuthorCovers(
  readDb: ReadDb,
  olid: string,
  authorNames: readonly string[],
) {
  if (authorNames.length === 0) return [];
  const rows = await readDb
    .select({
      ...imageResultSelection(drizzleSql<number | null>`NULL`.as("score")),
      ...openlibraryWorkSelection,
    })
    .from(image)
    .innerJoin(
      openlibrary_work,
      eq(openlibrary_work.olid, image.openlibrary_work_id),
    )
    .where(
      and(
        ne(openlibrary_work.olid, olid),
        drizzleSql`${openlibrary_work.author_names} && ${textArray(authorNames)}`,
        eq(image.searchable, true),
        eq(image.deleted, false),
      ),
    )
    .orderBy(
      drizzleSql`${openlibrary_work.edition_count} DESC NULLS LAST`,
      openlibrary_work.olid,
      image.id,
    )
    .limit(24);
  return z.array(DBImageDataValidator).parse(rows);
}

/** Nearest neighbours by cover embedding. */
async function getVisuallySimilarCovers(readDb: ReadDb, id: string) {
  const model = getModel();
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
  return z.array(DBImageDataValidator).parse(rows);
}

/**
 * Everything the cover page shows: the cover itself plus three related shelves.
 *
 * The shelves are deduplicated in priority order — a cover that is already shown
 * under "same book" or "same author" is dropped from the visually-similar shelf,
 * because near-duplicate uploads of one book dominate embedding distance and
 * would otherwise fill the page three times over.
 */
export const getImageDetail = createServerFn({
  method: "GET",
})
  .inputValidator(z.uuid())
  .handler(async ({ data: id }): Promise<ImageDetail> => {
    console.log(`getImageDetail: ${id}`);
    const start = performance.now();
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
        ...openlibraryWorkSelection,
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
      return EMPTY_DETAIL;
    }

    // Only a matched work has a book or an author to group by.
    const olid =
      target.openlibrary_work_id &&
      target.openlibrary_work_id_confidence !== "NO_MATCH"
        ? target.openlibrary_work_id
        : null;
    const authorNames = olid ? (target.openlibrary_author_names ?? []) : [];

    const [sameBookRows, sameAuthorRows, similarRows] = await Promise.all([
      olid ? getSameBookCovers(readDb, id, olid) : [],
      olid ? getSameAuthorCovers(readDb, olid, authorNames) : [],
      getVisuallySimilarCovers(readDb, id),
    ]);

    const seen = new Set<string>([id]);
    const takeUnseen = <T extends { id: string }>(rows: T[], limit: number) => {
      const kept: T[] = [];
      for (const row of rows) {
        if (seen.has(row.id) || kept.length >= limit) continue;
        seen.add(row.id);
        kept.push(row);
      }
      return kept;
    };

    const sameBook = takeUnseen(sameBookRows, 24);
    const sameAuthor = takeUnseen(sameAuthorRows, 24);
    const similar = takeUnseen(similarRows, 48);

    const time = performance.now() - start;
    console.log(`getImageDetail database lookup in ${time.toFixed(1)}ms`);
    await captureAnalyticsEvent({
      data: {
        eventType: "getImageDetail",
        payload: {
          id,
          sameBook: sameBook.length,
          sameAuthor: sameAuthor.length,
          similar: similar.length,
          time: time,
        },
      },
    });

    const [shapedTarget, shapedSameBook, shapedSameAuthor, shapedSimilar] =
      await Promise.all([
        shapeImageDataArray([target]),
        shapeImageDataArray(sameBook),
        shapeImageDataArray(sameAuthor),
        shapeImageDataArray(similar),
      ]);

    return {
      image: shapedTarget[0] ?? null,
      sameBook: shapedSameBook,
      sameAuthor: shapedSameAuthor,
      similar: shapedSimilar,
    };
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
      reranker: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (data.q === "") {
      return [];
    }

    const images = await singleModelSearch(data.q);
    const reranker = getReranker(data.reranker);
    if (!reranker) {
      return images;
    }
    return reranker.rerank(data.q, images);
  });
