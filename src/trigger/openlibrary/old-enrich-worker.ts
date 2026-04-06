import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  makeS3Client,
  getStoredMetadata,
  downloadS3File,
  headS3Object,
  worksParquetFile,
  authorsMetadataKey,
  enrichTmpChunkPrefix,
} from "./utils";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import { env } from "@/env";

const LOCAL_AUTHORS_PATH = "/tmp/enrich/authors_local.parquet";
const LOCAL_AUTHORS_META_PATH = "/tmp/enrich/authors_local.meta.json";
const LOCAL_EDITION_AGGREGATES_PATH =
  "/tmp/enrich/edition_aggregates_local.parquet";
const LOCAL_EDITION_AGGREGATES_META_PATH =
  "/tmp/enrich/edition_aggregates_local.meta.json";

interface AuthorsCacheMeta {
  etag: string;
  contentLength: number;
  rowCount: number;
}

interface EditionAggregatesCacheMeta {
  etag: string;
  contentLength: number;
}

const WorkerPayload = z.object({
  dumpDate: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
});

export const openLibraryEnrichWorkerTask = schemaTask({
  id: "openlibrary-enrich-worker",
  schema: WorkerPayload,
  machine: "small-2x",
  retry: { maxAttempts: 3, outOfMemory: { machine: "medium-1x" } },
  queue: { concurrencyLimit: 15 },
  run: async ({ dumpDate, chunkIndex, totalChunks, chunkSize }) => {
    const s3 = makeS3Client();

    const tmpDir = "/tmp/enrich";
    fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
    fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

    const db = await DuckDBInstance.create(`${tmpDir}/duck_${chunkIndex}.db`);
    const con = await db.connect();

    try {
      await con.run(`SET home_directory='${tmpDir}/home'`);
      await con.run(`SET temp_directory='${tmpDir}/temp'`);
      await con.run("SET max_temp_directory_size = '6GB'");
      await con.run("SET memory_limit = '500MB'");
      await con.run("SET threads = 2");
      await con.run("SET preserve_insertion_order = false");

      await con.run("INSTALL httpfs");
      await con.run("LOAD httpfs");

      await con.run(`
        CREATE OR REPLACE SECRET secret (
          type s3,
          endpoint '${env.S3_ENDPOINT.replace("https://", "")}',
          region '${env.S3_REGION}',
          key_id '${env.S3_ACCESS_KEY_ID}',
          secret '${env.S3_SECRET_ACCESS_KEY}'
        );
      `);

      // --- Cache authors.parquet ---
      const authorsS3Key = "openlibrary/authors.parquet";
      const authorsS3Head = await headS3Object(s3, authorsS3Key);
      if (!authorsS3Head) throw new Error("authors.parquet not found in S3");

      let useAuthorsCache = false;
      if (
        fs.existsSync(LOCAL_AUTHORS_PATH) &&
        fs.existsSync(LOCAL_AUTHORS_META_PATH)
      ) {
        const meta: AuthorsCacheMeta = JSON.parse(
          fs.readFileSync(LOCAL_AUTHORS_META_PATH, "utf-8"),
        );
        if (
          meta.etag === authorsS3Head.etag &&
          meta.contentLength === authorsS3Head.contentLength
        ) {
          const countRes = await con.run(
            `SELECT count(*) FROM read_parquet('${LOCAL_AUTHORS_PATH}')`,
          );
          const countRows = await countRes.getRows();
          const localRowCount = Number(countRows[0][0]);

          const authorsMetadata = await getStoredMetadata(s3, authorsMetadataKey);
          if (
            authorsMetadata?.row_count !== undefined &&
            localRowCount === authorsMetadata.row_count
          ) {
            useAuthorsCache = true;
            console.log("Using cached authors.parquet");
          }
        }
      }

      if (!useAuthorsCache) {
        console.log("Downloading authors.parquet from S3");
        await downloadS3File(s3, authorsS3Key, LOCAL_AUTHORS_PATH);

        const countRes = await con.run(
          `SELECT count(*) FROM read_parquet('${LOCAL_AUTHORS_PATH}')`,
        );
        const countRows = await countRes.getRows();
        const localRowCount = Number(countRows[0][0]);

        const cacheMeta: AuthorsCacheMeta = {
          etag: authorsS3Head.etag,
          contentLength: authorsS3Head.contentLength,
          rowCount: localRowCount,
        };
        fs.writeFileSync(LOCAL_AUTHORS_META_PATH, JSON.stringify(cacheMeta));
        console.log("authors.parquet downloaded and cached");
      }

      // --- Cache edition_aggregates.parquet ---
      const editionAggregatesS3Key = "openlibrary/edition_aggregates.parquet";
      const editionAggregatesS3Head = await headS3Object(
        s3,
        editionAggregatesS3Key,
      );
      if (!editionAggregatesS3Head)
        throw new Error("edition_aggregates.parquet not found in S3");

      let useEditionAggregatesCache = false;
      if (
        fs.existsSync(LOCAL_EDITION_AGGREGATES_PATH) &&
        fs.existsSync(LOCAL_EDITION_AGGREGATES_META_PATH)
      ) {
        const meta: EditionAggregatesCacheMeta = JSON.parse(
          fs.readFileSync(LOCAL_EDITION_AGGREGATES_META_PATH, "utf-8"),
        );
        if (
          meta.etag === editionAggregatesS3Head.etag &&
          meta.contentLength === editionAggregatesS3Head.contentLength
        ) {
          useEditionAggregatesCache = true;
          console.log("Using cached edition_aggregates.parquet");
        }
      }

      if (!useEditionAggregatesCache) {
        console.log("Downloading edition_aggregates.parquet from S3");
        await downloadS3File(
          s3,
          editionAggregatesS3Key,
          LOCAL_EDITION_AGGREGATES_PATH,
        );
        const cacheMeta: EditionAggregatesCacheMeta = {
          etag: editionAggregatesS3Head.etag,
          contentLength: editionAggregatesS3Head.contentLength,
        };
        fs.writeFileSync(
          LOCAL_EDITION_AGGREGATES_META_PATH,
          JSON.stringify(cacheMeta),
        );
        console.log("edition_aggregates.parquet downloaded and cached");
      }

      // --- Process chunk ---
      const offset = chunkIndex * chunkSize;
      const chunkKey = `${enrichTmpChunkPrefix}chunk_${chunkIndex}.parquet`;
      const chunkFile = `s3://${env.S3_BUCKET}/${chunkKey}`;

      await con.run(`
        COPY (
          WITH chunk AS (
            SELECT * FROM read_parquet('${worksParquetFile}')
            LIMIT ${chunkSize} OFFSET ${offset}
          ),
          flattened AS (
            SELECT
              w.* EXCLUDE (authors),
              replace(
                unnest(json_transform(json_extract(w.authors, '$[*].author.key'), '["VARCHAR"]')),
                '/authors/',
                ''
              ) AS author_id
            FROM chunk w
            WHERE w.authors IS NOT NULL
          ),
          needed_ids AS (SELECT DISTINCT author_id FROM flattened),
          filtered_authors AS (
            SELECT a.olid, a.name, a.alternate_names
            FROM read_parquet('${LOCAL_AUTHORS_PATH}') a
            INNER JOIN needed_ids n ON a.olid = n.author_id
          ),
          with_authors AS (
            SELECT
              fl.olid,
              fl.title,
              fl.subtitle,
              fl.translated_titles,
              fl.subjects,
              fl.subject_places,
              fl.subject_times,
              fl.subject_people,
              fl.description,
              fl.dewey_number,
              fl.lc_classifications,
              fl.first_sentence,
              fl.original_languages,
              fl.other_titles,
              fl.first_publish_date,
              fl.links,
              fl.notes,
              fl.cover_edition,
              fl.covers,
              list(DISTINCT fl.author_id) FILTER (WHERE fl.author_id IS NOT NULL) AS work_author_ids,
              list(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) AS work_author_names,
              list_distinct(flatten(list(coalesce(a.alternate_names, []::VARCHAR[])))) AS work_author_alternate_names
            FROM flattened fl
            LEFT JOIN filtered_authors a ON fl.author_id = a.olid
            GROUP BY
              fl.olid, fl.title, fl.subtitle, fl.translated_titles,
              fl.subjects, fl.subject_places, fl.subject_times, fl.subject_people,
              fl.description, fl.dewey_number, fl.lc_classifications, fl.first_sentence,
              fl.original_languages, fl.other_titles, fl.first_publish_date,
              fl.links, fl.notes, fl.cover_edition, fl.covers
          ),
          no_authors AS (
            SELECT
              w.olid,
              w.title,
              w.subtitle,
              w.translated_titles,
              w.subjects,
              w.subject_places,
              w.subject_times,
              w.subject_people,
              w.description,
              w.dewey_number,
              w.lc_classifications,
              w.first_sentence,
              w.original_languages,
              w.other_titles,
              w.first_publish_date,
              w.links,
              w.notes,
              w.cover_edition,
              w.covers,
              []::VARCHAR[] AS work_author_ids,
              []::VARCHAR[] AS work_author_names,
              []::VARCHAR[] AS work_author_alternate_names
            FROM chunk w
            WHERE w.authors IS NULL
              OR array_length(
                coalesce(
                  TRY_CAST(json_extract(w.authors::JSON, '$[*].author.key') AS VARCHAR[]),
                  []::VARCHAR[]
                )
              ) = 0
          ),
          edition_needed_ids AS (
            SELECT DISTINCT edition_author_id AS author_id
            FROM read_parquet('${LOCAL_EDITION_AGGREGATES_PATH}') ea,
            UNNEST(coalesce(ea.edition_author_ids, []::VARCHAR[])) t(edition_author_id)
            WHERE ea.work_olid IN (SELECT olid FROM chunk)
          ),
          all_needed_ids AS (
            SELECT author_id FROM needed_ids
            UNION
            SELECT author_id FROM edition_needed_ids
          ),
          filtered_all_authors AS (
            SELECT a.olid, a.name, a.alternate_names
            FROM read_parquet('${LOCAL_AUTHORS_PATH}') a
            INNER JOIN all_needed_ids n ON a.olid = n.author_id
          ),
          edition_author_names AS (
            SELECT
              ea.work_olid AS olid,
              list(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) AS edition_author_names,
              list_distinct(flatten(list(coalesce(a.alternate_names, []::VARCHAR[])))) AS edition_author_alternate_names
            FROM read_parquet('${LOCAL_EDITION_AGGREGATES_PATH}') ea
            LEFT JOIN filtered_all_authors a ON list_contains(coalesce(ea.edition_author_ids, []::VARCHAR[]), a.olid)
            WHERE ea.work_olid IN (SELECT olid FROM chunk)
            GROUP BY ea.work_olid
          ),
          all_works AS (
            SELECT * FROM with_authors
            UNION ALL
            SELECT * FROM no_authors
          )
          SELECT
            aw.olid,
            aw.title,
            aw.subtitle,
            aw.translated_titles,
            aw.subjects,
            aw.subject_places,
            aw.subject_times,
            aw.subject_people,
            aw.description,
            aw.dewey_number,
            aw.lc_classifications,
            aw.first_sentence,
            aw.original_languages,
            aw.other_titles,
            aw.first_publish_date,
            aw.links,
            aw.notes,
            aw.cover_edition,
            aw.covers,
            aw.work_author_ids,
            aw.work_author_names,
            aw.work_author_alternate_names,
            coalesce(ea.edition_author_ids, []::VARCHAR[]) AS edition_author_ids,
            coalesce(ean.edition_author_names, []::VARCHAR[]) AS edition_author_names,
            coalesce(ean.edition_author_alternate_names, []::VARCHAR[]) AS edition_author_alternate_names,
            list_distinct(list_concat(aw.work_author_ids, coalesce(ea.edition_author_ids, []::VARCHAR[]))) AS author_ids,
            list_distinct(list_concat(aw.work_author_names, coalesce(ean.edition_author_names, []::VARCHAR[]))) AS author_names,
            list_distinct(list_concat(aw.work_author_alternate_names, coalesce(ean.edition_author_alternate_names, []::VARCHAR[]))) AS author_alternate_names,
            coalesce(ea.edition_count, 0) AS edition_count,
            coalesce(ea.edition_olids, []::VARCHAR[]) AS edition_olids,
            coalesce(ea.edition_titles, []::VARCHAR[]) AS edition_titles,
            coalesce(ea.edition_subtitles, []::VARCHAR[]) AS edition_subtitles,
            coalesce(ea.edition_publish_dates, []::VARCHAR[]) AS edition_publish_dates,
            coalesce(ea.edition_publish_years, []::INTEGER[]) AS edition_publish_years,
            ea.first_edition_publish_year,
            ea.latest_edition_publish_year,
            coalesce(ea.by_statements, []::VARCHAR[]) AS by_statements,
            coalesce(ea.publishers, []::VARCHAR[]) AS publishers,
            coalesce(ea.publish_places, []::VARCHAR[]) AS publish_places,
            coalesce(ea.languages, []::VARCHAR[]) AS languages,
            coalesce(ea.isbn_10, []::VARCHAR[]) AS isbn_10,
            coalesce(ea.isbn_13, []::VARCHAR[]) AS isbn_13,
            list_distinct(
              list_concat(
                [aw.title],
                CASE WHEN aw.subtitle IS NULL THEN []::VARCHAR[] ELSE [aw.subtitle] END,
                coalesce(aw.other_titles, []::VARCHAR[]),
                coalesce(
                  TRY_CAST(json_extract(aw.translated_titles::JSON, '$[*].title') AS VARCHAR[]),
                  []::VARCHAR[]
                ),
                coalesce(ea.edition_titles, []::VARCHAR[]),
                coalesce(ea.edition_subtitles, []::VARCHAR[])
              )
            ) AS title_aliases,
            trim(
              regexp_replace(
                lower(
                  array_to_string(
                    list_distinct(
                      list_concat(
                        [aw.title],
                        CASE WHEN aw.subtitle IS NULL THEN []::VARCHAR[] ELSE [aw.subtitle] END,
                        coalesce(aw.other_titles, []::VARCHAR[]),
                        coalesce(
                          TRY_CAST(json_extract(aw.translated_titles::JSON, '$[*].title') AS VARCHAR[]),
                          []::VARCHAR[]
                        ),
                        coalesce(ea.edition_titles, []::VARCHAR[]),
                        coalesce(ea.edition_subtitles, []::VARCHAR[])
                      )
                    ),
                    ' '
                  )
                ),
                '[^a-z0-9]+',
                ' ',
                'g'
              )
            ) AS title_alias_text,
            trim(
              regexp_replace(
                lower(
                  array_to_string(
                    list_distinct(
                      list_concat(
                        aw.work_author_names,
                        aw.work_author_alternate_names,
                        coalesce(ean.edition_author_names, []::VARCHAR[]),
                        coalesce(ean.edition_author_alternate_names, []::VARCHAR[])
                      )
                    ),
                    ' '
                  )
                ),
                '[^a-z0-9]+',
                ' ',
                'g'
              )
            ) AS author_text,
            trim(
              regexp_replace(
                lower(
                  concat_ws(
                    ' ',
                    aw.title,
                    aw.subtitle,
                    aw.description,
                    aw.first_sentence,
                    aw.notes,
                    array_to_string(coalesce(aw.other_titles, []::VARCHAR[]), ' '),
                    array_to_string(
                      coalesce(
                        TRY_CAST(json_extract(aw.translated_titles::JSON, '$[*].title') AS VARCHAR[]),
                        []::VARCHAR[]
                      ),
                      ' '
                    ),
                    array_to_string(aw.work_author_names, ' '),
                    array_to_string(aw.work_author_alternate_names, ' '),
                    array_to_string(coalesce(ean.edition_author_names, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ean.edition_author_alternate_names, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.edition_titles, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.edition_subtitles, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.publishers, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.publish_places, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.by_statements, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.isbn_10, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(ea.isbn_13, []::VARCHAR[]), ' '),
                    array_to_string(coalesce(aw.subjects, []::VARCHAR[]), ' ')
                  )
                ),
                '[^a-z0-9]+',
                ' ',
                'g'
              )
            ) AS search_text,
            (
              least(coalesce(ea.edition_count, 0), 250) * 4 +
              CASE WHEN array_length(aw.work_author_names) > 0 THEN 60 ELSE 0 END +
              CASE WHEN array_length(coalesce(ean.edition_author_names, []::VARCHAR[])) > 0 THEN 20 ELSE 0 END +
              CASE WHEN aw.description IS NOT NULL THEN 30 ELSE 0 END +
              CASE WHEN aw.first_publish_date IS NOT NULL THEN 15 ELSE 0 END +
              CASE WHEN array_length(aw.covers) > 0 THEN 10 ELSE 0 END +
              CASE WHEN array_length(coalesce(ea.isbn_13, []::VARCHAR[])) > 0 THEN 10 ELSE 0 END +
              CASE WHEN array_length(coalesce(ea.edition_titles, []::VARCHAR[])) > 1 THEN 10 ELSE 0 END
            ) AS canonical_score
          FROM all_works aw
          LEFT JOIN read_parquet('${LOCAL_EDITION_AGGREGATES_PATH}') ea ON aw.olid = ea.work_olid
          LEFT JOIN edition_author_names ean ON aw.olid = ean.olid
        )
        TO '${chunkFile}' (FORMAT PARQUET, COMPRESSION 'ZSTD')
      `);

      console.log(`Chunk ${chunkIndex + 1}/${totalChunks} done`);
      return { chunkIndex };
    } finally {
      con.closeSync();
      db.closeSync();
    }
  },
});
