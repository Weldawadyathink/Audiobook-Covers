import { shapeImageDataArray, ImageData } from "@/server/imageData";
import { createReadDb } from "@/db.cloudflare";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { image, openlibrary_work } from "@/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { env } from "@/env.cloudflare";

type SearchMode = "titleAuthor" | "title" | "author" | "query";
type ReadDb = ReturnType<typeof createReadDb>;

function createImageWorks(readDb: ReadDb) {
  return readDb.$with("image_works").as(
    readDb
      .selectDistinct({
        olid: image.openlibrary_work_id,
      })
      .from(image)
      .where(
        and(
          eq(image.searchable, true),
          eq(image.deleted, false),
          isNotNull(image.openlibrary_work_id),
        ),
      ),
  );
}

function titleVector() {
  return sql`to_tsvector('simple'::regconfig, COALESCE(${openlibrary_work.title}, ''))`;
}

function authorVector() {
  return sql`to_tsvector('simple'::regconfig, immutable_array_to_string(${openlibrary_work.author_names}, ' '))`;
}

function titleQuery(value: string) {
  return sql`websearch_to_tsquery('simple'::regconfig, ${value})`;
}

function authorQuery(value: string) {
  return sql`websearch_to_tsquery('simple'::regconfig, ${value})`;
}

function resultSelection<TScore>(score: TScore) {
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

export const coverSearch = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      title: z.string().optional(),
      author: z.string().optional(),
    }),
  )
  .handler(async ({ data: { title, author } }): Promise<ImageData[]> => {
    const trimmedTitle = title?.trim() ?? "";
    const trimmedAuthor = author?.trim() ?? "";

    const start = performance.now();
    const readDb = createReadDb();
    const imageWorks = createImageWorks(readDb);
    let searchMode: SearchMode;
    let results: Array<z.infer<typeof DBImageDataValidator>>;

    if (trimmedTitle && trimmedAuthor) {
      searchMode = "titleAuthor";
      const titleTsQuery = titleQuery(trimmedTitle);
      const authorTsQuery = authorQuery(trimmedAuthor);
      const score = sql<number>`(
        ts_rank(${titleVector()}, ${titleTsQuery}) +
        ts_rank(${authorVector()}, ${authorTsQuery})
      )`.as("score");
      const rankedWorks = readDb.$with("ranked_works").as(
        readDb
          .select({
            olid: openlibrary_work.olid,
            score,
          })
          .from(imageWorks)
          .innerJoin(
            openlibrary_work,
            eq(openlibrary_work.olid, imageWorks.olid),
          )
          .where(
            and(
              sql`${titleVector()} @@ ${titleTsQuery}`,
              sql`${authorVector()} @@ ${authorTsQuery}`,
            ),
          )
          .orderBy(desc(score))
          .limit(100),
      );

      const rows = await readDb
        .with(imageWorks, rankedWorks)
        .select(resultSelection(rankedWorks.score))
        .from(rankedWorks)
        .innerJoin(image, eq(image.openlibrary_work_id, rankedWorks.olid))
        .where(and(eq(image.searchable, true), eq(image.deleted, false)))
        .orderBy(desc(rankedWorks.score), image.id)
        .limit(100);
      results = z.array(DBImageDataValidator).parse(rows);
    } else if (trimmedTitle) {
      searchMode = "title";
      const titleTsQuery = titleQuery(trimmedTitle);
      const score = sql<number>`ts_rank(${titleVector()}, ${titleTsQuery})`.as(
        "score",
      );
      const rankedWorks = readDb.$with("ranked_works").as(
        readDb
          .select({
            olid: openlibrary_work.olid,
            score,
          })
          .from(imageWorks)
          .innerJoin(
            openlibrary_work,
            eq(openlibrary_work.olid, imageWorks.olid),
          )
          .where(sql`${titleVector()} @@ ${titleTsQuery}`)
          .orderBy(desc(score))
          .limit(100),
      );

      const rows = await readDb
        .with(imageWorks, rankedWorks)
        .select(resultSelection(rankedWorks.score))
        .from(rankedWorks)
        .innerJoin(image, eq(image.openlibrary_work_id, rankedWorks.olid))
        .where(and(eq(image.searchable, true), eq(image.deleted, false)))
        .orderBy(desc(rankedWorks.score), image.id)
        .limit(100);
      results = z.array(DBImageDataValidator).parse(rows);
    } else if (trimmedAuthor) {
      searchMode = "author";
      const authorTsQuery = authorQuery(trimmedAuthor);
      const score =
        sql<number>`ts_rank(${authorVector()}, ${authorTsQuery})`.as("score");
      const rankedWorks = readDb.$with("ranked_works").as(
        readDb
          .select({
            olid: openlibrary_work.olid,
            score,
          })
          .from(imageWorks)
          .innerJoin(
            openlibrary_work,
            eq(openlibrary_work.olid, imageWorks.olid),
          )
          .where(sql`${authorVector()} @@ ${authorTsQuery}`)
          .orderBy(desc(score))
          .limit(100),
      );

      const rows = await readDb
        .with(imageWorks, rankedWorks)
        .select(resultSelection(rankedWorks.score))
        .from(rankedWorks)
        .innerJoin(image, eq(image.openlibrary_work_id, rankedWorks.olid))
        .where(and(eq(image.searchable, true), eq(image.deleted, false)))
        .orderBy(desc(rankedWorks.score), image.id)
        .limit(100);
      results = z.array(DBImageDataValidator).parse(rows);
    } else {
      return [];
    }

    const time = performance.now() - start;
    const final = await shapeImageDataArray(results);

    await captureAnalyticsEvent({
      data: {
        eventType: "coverSearch",
        payload: {
          appStage: env.APP_STAGE,
          title: trimmedTitle || "",
          author: trimmedAuthor || "",
          searchMode,
          results: final.length,
          databaseTime: time,
        },
      },
    });

    return final;
  });
