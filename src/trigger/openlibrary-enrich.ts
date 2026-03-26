import { task, tasks } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  getStoredMetadata,
  putMetadata,
  deleteMetadata,
  downloadS3File,
  deleteS3Prefix,
  worksParquetFile,
  authorsParquetFile,
  enrichedWorksParquetFile,
  enrichedMetadataKey,
  enrichTmpChunkPrefix,
} from "./openlibrary-utils";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import { env } from "@/env";
import { ResourceMonitor } from "./resourceMonitor";
import { olQueue } from "./openlibrary-etl";

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  resourceMonitor.startMonitoring(10_000);
  await next();
  resourceMonitor.stopMonitoring();
});

const CHUNK_SIZE = 500_000;
const LOCAL_AUTHORS_PATH = "/tmp/enrich/authors_local.parquet";

export const openLibraryEnrichTask = task({
  id: "openlibrary-enrich",
  machine: "medium-1x",
  retry: {
    maxAttempts: 3,
  },
  queue: olQueue,
  run: async ({ dumpDate }: { dumpDate: string }) => {
    const s3 = makeS3Client();

    const stored = await getStoredMetadata(s3, enrichedMetadataKey);
    if (stored !== null && stored.dump_date === dumpDate) {
      console.log(`Enriched works already complete for ${dumpDate}. Skipping.`);
      return { row_count: stored.row_count ?? 0 };
    }

    await deleteMetadata(s3, enrichedMetadataKey);
    await deleteS3Prefix(s3, enrichTmpChunkPrefix);

    const tmpDir = "/tmp/enrich";
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
    fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

    const db = await DuckDBInstance.create(`${tmpDir}/duck.db`);
    const con = await db.connect();

    try {
      await con.run(`SET home_directory='${tmpDir}/home'`);
      await con.run(`SET temp_directory='${tmpDir}/temp'`);
      await con.run("SET max_temp_directory_size = '6GB'");
      await con.run("SET memory_limit = '1GB'");
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

      // Step 1: Download authors parquet locally
      const authorsS3Key = `openlibrary/authors.parquet`;
      console.log("Downloading authors parquet to local disk");
      await downloadS3File(s3, authorsS3Key, LOCAL_AUTHORS_PATH);
      console.log("Authors parquet downloaded");

      // Step 2: Count total works rows
      const countResult = await con.run(
        `SELECT count(*) FROM read_parquet('${worksParquetFile}')`,
      );
      const countRows = await countResult.getRows();
      const totalRows = Number(countRows[0][0]);
      const numChunks = Math.ceil(totalRows / CHUNK_SIZE);
      console.log(
        `Total works rows: ${totalRows.toLocaleString()}, processing in ${numChunks} chunks`,
      );

      // Step 3: Process chunks
      for (let i = 0; i < numChunks; i++) {
        const offset = i * CHUNK_SIZE;
        const chunkKey = `${enrichTmpChunkPrefix}chunk_${i}.parquet`;
        const chunkFile = `s3://${env.S3_BUCKET}/${chunkKey}`;

        await con.run(`
          COPY (
            WITH chunk AS (
              SELECT * FROM read_parquet('${worksParquetFile}')
              LIMIT ${CHUNK_SIZE} OFFSET ${offset}
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

        console.log(`Chunk ${i + 1}/${numChunks} done`);
      }

      // Step 4: Combine all chunks into final output
      console.log("Combining chunks into final enriched_works.parquet");
      const allChunksGlob = `s3://${env.S3_BUCKET}/${enrichTmpChunkPrefix}*.parquet`;
      await con.run(`
        COPY (
          SELECT * FROM read_parquet('${allChunksGlob}')
        )
        TO '${enrichedWorksParquetFile}' (FORMAT PARQUET, COMPRESSION 'ZSTD')
      `);
      console.log("Combined all chunks");

      // Step 5: Delete temp S3 chunks
      console.log("Cleaning up temp S3 chunks");
      await deleteS3Prefix(s3, enrichTmpChunkPrefix);

      // Step 6: Count output rows and save metadata
      const result = await con.run(
        `SELECT count(*) FROM '${enrichedWorksParquetFile}'`,
      );
      const rows = await result.getRows();
      const rowCount = Number(rows[0][0]);
      console.log(
        `Wrote ${rowCount.toLocaleString()} enriched works rows to Parquet in S3`,
      );

      await putMetadata(s3, enrichedMetadataKey, {
        dump_date: dumpDate,
        row_count: rowCount,
        updated_at: new Date().toISOString(),
      });

      return { row_count: rowCount };
    } finally {
      con.closeSync();
      db.closeSync();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
});
