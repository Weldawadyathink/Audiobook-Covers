import { shapeImageDataArray, ImageData } from "@/server/imageData";
import { getDbReadConnection } from "@/server/db";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { logAnalyticsEvent } from "@/server/analytics";
import { env } from "@/env.cloudflare";
import { waitUntil } from "cloudflare:workers";

type SearchMode = "titleAuthor" | "title" | "author" | "query";

export const coverSearch = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      q: z.string().default(""),
      title: z.string().optional(),
      author: z.string().optional(),
    }),
  )
  .handler(async ({ data: { q, title, author } }): Promise<ImageData[]> => {
    const trimmedQuery = q.trim();
    const trimmedTitle = title?.trim() ?? "";
    const trimmedAuthor = author?.trim() ?? "";

    if (!trimmedTitle && !trimmedAuthor && trimmedQuery === "") return [];

    const start = performance.now();
    const { sql, sqlTools } = getDbReadConnection();

    let searchMode: SearchMode;
    let results: Array<z.infer<typeof DBImageDataValidator>>;

    if (trimmedTitle && trimmedAuthor) {
      searchMode = "titleAuthor";
      results = await sqlTools.many(DBImageDataValidator)`
        WITH image_works AS (
          SELECT DISTINCT openlibrary_work_id AS olid
          FROM image
          WHERE searchable IS TRUE
            AND deleted IS FALSE
            AND openlibrary_work_id IS NOT NULL
        ),
        query AS (
          SELECT
            websearch_to_tsquery('simple'::regconfig, ${trimmedTitle}) AS title_tsquery,
            websearch_to_tsquery('simple'::regconfig, ${trimmedAuthor}) AS author_tsquery
        ),
        ranked_works AS (
          SELECT
            work.olid,
            (
              ts_rank(to_tsvector('simple'::regconfig, COALESCE(work.title, '')), query.title_tsquery) +
              ts_rank(
                to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')),
                query.author_tsquery
              )
            ) AS score
          FROM image_works
          JOIN openlibrary_work work ON work.olid = image_works.olid
          CROSS JOIN query
          WHERE to_tsvector('simple'::regconfig, COALESCE(work.title, '')) @@ query.title_tsquery
            AND to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')) @@ query.author_tsquery
          ORDER BY score DESC
          LIMIT 100
        )
        SELECT
          image.id,
          image.source,
          image.extension,
          image.blurhash,
          image.from_old_database,
          image.searchable,
          ranked_works.score
        FROM ranked_works
        JOIN image ON image.openlibrary_work_id = ranked_works.olid
        WHERE image.searchable IS TRUE
          AND image.deleted IS FALSE
        ORDER BY ranked_works.score DESC, image.id
        LIMIT 100
      `;
    } else if (trimmedTitle) {
      searchMode = "title";
      results = await sqlTools.many(DBImageDataValidator)`
        WITH image_works AS (
          SELECT DISTINCT openlibrary_work_id AS olid
          FROM image
          WHERE searchable IS TRUE
            AND deleted IS FALSE
            AND openlibrary_work_id IS NOT NULL
        ),
        query AS (
          SELECT
            websearch_to_tsquery('simple'::regconfig, ${trimmedTitle}) AS title_tsquery
        ),
        ranked_works AS (
          SELECT
            work.olid,
            ts_rank(to_tsvector('simple'::regconfig, COALESCE(work.title, '')), query.title_tsquery) AS score
          FROM image_works
          JOIN openlibrary_work work ON work.olid = image_works.olid
          CROSS JOIN query
          WHERE to_tsvector('simple'::regconfig, COALESCE(work.title, '')) @@ query.title_tsquery
          ORDER BY score DESC
          LIMIT 100
        )
        SELECT
          image.id,
          image.source,
          image.extension,
          image.blurhash,
          image.from_old_database,
          image.searchable,
          ranked_works.score
        FROM ranked_works
        JOIN image ON image.openlibrary_work_id = ranked_works.olid
        WHERE image.searchable IS TRUE
          AND image.deleted IS FALSE
        ORDER BY ranked_works.score DESC, image.id
        LIMIT 100
      `;
    } else if (trimmedAuthor) {
      searchMode = "author";
      results = await sqlTools.many(DBImageDataValidator)`
        WITH image_works AS (
          SELECT DISTINCT openlibrary_work_id AS olid
          FROM image
          WHERE searchable IS TRUE
            AND deleted IS FALSE
            AND openlibrary_work_id IS NOT NULL
        ),
        query AS (
          SELECT
            websearch_to_tsquery('simple'::regconfig, ${trimmedAuthor}) AS author_tsquery
        ),
        ranked_works AS (
          SELECT
            work.olid,
            ts_rank(
              to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')),
              query.author_tsquery
            ) AS score
          FROM image_works
          JOIN openlibrary_work work ON work.olid = image_works.olid
          CROSS JOIN query
          WHERE to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')) @@ query.author_tsquery
          ORDER BY score DESC
          LIMIT 100
        )
        SELECT
          image.id,
          image.source,
          image.extension,
          image.blurhash,
          image.from_old_database,
          image.searchable,
          ranked_works.score
        FROM ranked_works
        JOIN image ON image.openlibrary_work_id = ranked_works.olid
        WHERE image.searchable IS TRUE
          AND image.deleted IS FALSE
        ORDER BY ranked_works.score DESC, image.id
        LIMIT 100
      `;
    } else {
      searchMode = "query";
      results = await sqlTools.many(DBImageDataValidator)`
        WITH image_works AS (
          SELECT DISTINCT openlibrary_work_id AS olid
          FROM image
          WHERE searchable IS TRUE
            AND deleted IS FALSE
            AND openlibrary_work_id IS NOT NULL
        ),
        query AS (
          SELECT
            websearch_to_tsquery('simple'::regconfig, ${trimmedQuery}) AS search_tsquery
        ),
        ranked_works AS (
          SELECT
            work.olid,
            (
              ts_rank(
                to_tsvector('simple'::regconfig, COALESCE(work.title, '')),
                query.search_tsquery
              ) +
              ts_rank(
                to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')),
                query.search_tsquery
              )
            ) AS score
          FROM image_works
          JOIN openlibrary_work work ON work.olid = image_works.olid
          CROSS JOIN query
          WHERE to_tsvector('simple'::regconfig, COALESCE(work.title, '')) @@ query.search_tsquery
             OR to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')) @@ query.search_tsquery
          ORDER BY score DESC
          LIMIT 100
        )
        SELECT
          image.id,
          image.source,
          image.extension,
          image.blurhash,
          image.from_old_database,
          image.searchable,
          ranked_works.score
        FROM ranked_works
        JOIN image ON image.openlibrary_work_id = ranked_works.olid
        WHERE image.searchable IS TRUE
          AND image.deleted IS FALSE
        ORDER BY ranked_works.score DESC, image.id
        LIMIT 100
      `;
    }

    const time = performance.now() - start;
    const final = await shapeImageDataArray(results);

    await logAnalyticsEvent({
      data: {
        eventType: "coverSearch",
        payload: {
          appStage: env.APP_STAGE,
          q: trimmedQuery,
          title: trimmedTitle || undefined,
          author: trimmedAuthor || undefined,
          searchMode,
          results: final.length,
          databaseTime: time,
        },
      },
    });

    waitUntil(sql.end());
    return final;
  });
