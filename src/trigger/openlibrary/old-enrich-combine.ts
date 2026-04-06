import { task } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  putMetadata,
  deleteS3Prefix,
  enrichedWorksParquetFile,
  enrichedMetadataKey,
  enrichTmpChunkPrefix,
} from "./utils";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import { env } from "@/env";

export const openLibraryEnrichCombineTask = task({
  id: "openlibrary-enrich-combine",
  machine: "medium-2x",
  retry: {
    maxAttempts: 1,
  },
  run: async ({ dumpDate }: { dumpDate: string }) => {
    const s3 = makeS3Client();

    const tmpDir = "/tmp/enrich-combine";
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
    fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

    const db = await DuckDBInstance.create(`${tmpDir}/duck.db`);
    const con = await db.connect();

    try {
      await con.run(`SET home_directory='${tmpDir}/home'`);
      await con.run(`SET temp_directory='${tmpDir}/temp'`);
      await con.run("SET max_temp_directory_size = '6GB'");
      await con.run("SET memory_limit = '3.5GB'");
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

      const allChunksGlob = `s3://${env.S3_BUCKET}/${enrichTmpChunkPrefix}*.parquet`;

      console.log("Combining chunks into final enriched_works.parquet");
      await con.run(`
        COPY (
          SELECT * FROM read_parquet('${allChunksGlob}')
        )
        TO '${enrichedWorksParquetFile}' (FORMAT PARQUET, COMPRESSION 'ZSTD')
      `);
      console.log("Combined all chunks");

      console.log("Cleaning up temp S3 chunks");
      await deleteS3Prefix(s3, enrichTmpChunkPrefix);

      const result = await con.run(
        `SELECT count(*) FROM read_parquet('${enrichedWorksParquetFile}')`,
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
