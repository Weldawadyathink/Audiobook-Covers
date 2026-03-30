import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  makeS3Client,
  getStoredMetadata,
  downloadS3File,
  headS3Object,
  worksParquetFile,
  authorsMetadataKey,
  editionCountsParquetFile,
  enrichTmpChunkPrefix,
} from "./utils";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import { env } from "@/env";

const LOCAL_AUTHORS_PATH = "/tmp/enrich/authors_local.parquet";
const LOCAL_AUTHORS_META_PATH = "/tmp/enrich/authors_local.meta.json";
const LOCAL_EDITION_COUNTS_PATH = "/tmp/enrich/edition_counts_local.parquet";
const LOCAL_EDITION_COUNTS_META_PATH =
  "/tmp/enrich/edition_counts_local.meta.json";

interface AuthorsCacheMeta {
  etag: string;
  contentLength: number;
  rowCount: number;
}

interface EditionCountsCacheMeta {
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

      // --- Cache edition_counts.parquet ---
      const editionCountsS3Key = "openlibrary/edition_counts.parquet";
      const editionCountsS3Head = await headS3Object(s3, editionCountsS3Key);
      if (!editionCountsS3Head)
        throw new Error("edition_counts.parquet not found in S3");

      let useEditionCountsCache = false;
      if (
        fs.existsSync(LOCAL_EDITION_COUNTS_PATH) &&
        fs.existsSync(LOCAL_EDITION_COUNTS_META_PATH)
      ) {
        const meta: EditionCountsCacheMeta = JSON.parse(
          fs.readFileSync(LOCAL_EDITION_COUNTS_META_PATH, "utf-8"),
        );
        if (
          meta.etag === editionCountsS3Head.etag &&
          meta.contentLength === editionCountsS3Head.contentLength
        ) {
          useEditionCountsCache = true;
          console.log("Using cached edition_counts.parquet");
        }
      }

      if (!useEditionCountsCache) {
        console.log("Downloading edition_counts.parquet from S3");
        await downloadS3File(
          s3,
          editionCountsS3Key,
          LOCAL_EDITION_COUNTS_PATH,
        );
        const cacheMeta: EditionCountsCacheMeta = {
          etag: editionCountsS3Head.etag,
          contentLength: editionCountsS3Head.contentLength,
        };
        fs.writeFileSync(
          LOCAL_EDITION_COUNTS_META_PATH,
          JSON.stringify(cacheMeta),
        );
        console.log("edition_counts.parquet downloaded and cached");
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
              list(DISTINCT fl.author_id) FILTER (WHERE fl.author_id IS NOT NULL) AS author_ids,
              list(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL) AS author_names,
              list_distinct(flatten(list(coalesce(a.alternate_names, []::VARCHAR[])))) AS author_alternate_names
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
              []::VARCHAR[] AS author_ids,
              []::VARCHAR[] AS author_names,
              []::VARCHAR[] AS author_alternate_names
            FROM chunk w
            WHERE w.authors IS NULL
          ),
          all_works AS (
            SELECT * FROM with_authors
            UNION ALL
            SELECT * FROM no_authors
          )
          SELECT
            aw.*,
            coalesce(ec.edition_count, 0) AS edition_count
          FROM all_works aw
          LEFT JOIN read_parquet('${LOCAL_EDITION_COUNTS_PATH}') ec ON aw.olid = ec.work_olid
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
