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

interface AuthorsCacheMeta {
  etag: string;
  contentLength: number;
  rowCount: number;
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

      // Validate or download authors.parquet cache
      const authorsS3Key = "openlibrary/authors.parquet";
      const s3Head = await headS3Object(s3, authorsS3Key);
      if (!s3Head) throw new Error("authors.parquet not found in S3");

      let useCache = false;
      const localParquetExists = fs.existsSync(LOCAL_AUTHORS_PATH);
      const localMetaExists = fs.existsSync(LOCAL_AUTHORS_META_PATH);

      if (localParquetExists && localMetaExists) {
        const meta: AuthorsCacheMeta = JSON.parse(
          fs.readFileSync(LOCAL_AUTHORS_META_PATH, "utf-8"),
        );
        if (
          meta.etag === s3Head.etag &&
          meta.contentLength === s3Head.contentLength
        ) {
          const countRes = await con.run(
            `SELECT count(*) FROM read_parquet('${LOCAL_AUTHORS_PATH}')`,
          );
          const countRows = await countRes.getRows();
          const localRowCount = Number(countRows[0][0]);

          const authorsMetadata = await getStoredMetadata(
            s3,
            authorsMetadataKey,
          );
          if (
            authorsMetadata?.row_count !== undefined &&
            localRowCount === authorsMetadata.row_count
          ) {
            useCache = true;
            console.log("Using cached authors.parquet");
          }
        }
      }

      if (!useCache) {
        console.log("Downloading authors.parquet from S3");
        await downloadS3File(s3, authorsS3Key, LOCAL_AUTHORS_PATH);

        const countRes = await con.run(
          `SELECT count(*) FROM read_parquet('${LOCAL_AUTHORS_PATH}')`,
        );
        const countRows = await countRes.getRows();
        const localRowCount = Number(countRows[0][0]);

        const cacheMeta: AuthorsCacheMeta = {
          etag: s3Head.etag,
          contentLength: s3Head.contentLength,
          rowCount: localRowCount,
        };
        fs.writeFileSync(LOCAL_AUTHORS_META_PATH, JSON.stringify(cacheMeta));
        console.log("Authors.parquet downloaded and cached");
      }

      // Process chunk
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
            SELECT a.*
            FROM read_parquet('${LOCAL_AUTHORS_PATH}') a
            INNER JOIN needed_ids n ON a.olid = n.author_id
          )
          SELECT
            fl.*,
            a.* EXCLUDE (olid)
          FROM flattened fl
          LEFT JOIN filtered_authors a ON fl.author_id = a.olid
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
