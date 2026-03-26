import { task, tasks } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  getStoredMetadata,
  putMetadata,
  deleteMetadata,
  authorsParquetFile,
  authorsMetadataKey,
  enrichedMetadataKey,
  authorsDumpUrl,
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

export const openLibraryAuthorsTask = task({
  id: "openlibrary-authors",
  machine: "small-2x",
  retry: {
    maxAttempts: 1,
  },
  queue: olQueue,
  run: async ({ dumpDate }: { dumpDate: string }) => {
    const s3 = makeS3Client();

    const stored = await getStoredMetadata(s3, authorsMetadataKey);
    if (stored !== null && stored.dump_date === dumpDate) {
      console.log(`Authors already imported for ${dumpDate}. Skipping.`);
      return { row_count: stored.row_count ?? 0 };
    }

    // Invalidate enriched before writing new authors so a crash mid-run
    // doesn't leave stale enriched data marked as current.
    await deleteMetadata(s3, enrichedMetadataKey);
    await deleteMetadata(s3, authorsMetadataKey);

    const tmpDir = "/tmp/authors";
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
    fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

    const db = await DuckDBInstance.create(`${tmpDir}/duck.db`);
    const con = await db.connect();

    try {
      await con.run(`SET home_directory='${tmpDir}/home'`);
      await con.run(`SET temp_directory='${tmpDir}/temp'`);
      await con.run("SET max_temp_directory_size = '6GB'");
      await con.run("SET memory_limit = '700MB'");

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

      console.log("Downloading authors dump and copying to S3 parquet");
      await con.run(`
        COPY (
          SELECT
            replace(json_extract_string(data, '$.key'), '/authors/', '') AS olid,
            json_extract_string(data, '$.name')                          AS name,
            TRY_CAST(json_extract(data, '$.eastern_order') AS BOOLEAN)  AS eastern_order,
            json_extract_string(data, '$.personal_name')                 AS personal_name,
            json_extract_string(data, '$.enumeration')                   AS enumeration,
            json_extract_string(data, '$.title')                         AS title,
            coalesce(json_extract(data, '$.alternate_names')::VARCHAR[], []::VARCHAR[]) AS alternate_names,
            coalesce(json_extract(data, '$.uris')::VARCHAR[],            []::VARCHAR[]) AS uris,
            CASE json_type(data, '$.bio')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.bio')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.bio.value')
            END AS bio,
            json_extract_string(data, '$.location')                      AS location,
            json_extract_string(data, '$.birth_date')                    AS birth_date,
            json_extract_string(data, '$.death_date')                    AS death_date,
            json_extract_string(data, '$.date')                          AS date,
            json_extract_string(data, '$.wikipedia')                     AS wikipedia,
            json_extract(data, '$.links')::VARCHAR                       AS links
          FROM read_csv(
            '${authorsDumpUrl}',
            sep           = '\t',
            header        = false,
            quote         = '',
            columns       = {type: 'VARCHAR', key: 'VARCHAR', revision: 'VARCHAR',
                             last_modified: 'VARCHAR', data: 'VARCHAR'},
            ignore_errors = true
          )
        ) TO '${authorsParquetFile}' (FORMAT PARQUET, COMPRESSION ZSTD)
      `);

      const result = await con.run(
        `SELECT count(*) FROM '${authorsParquetFile}'`,
      );
      const rows = await result.getRows();
      const rowCount = Number(rows[0][0]);
      console.log(
        `Wrote ${rowCount.toLocaleString()} authors rows to Parquet in S3`,
      );

      await putMetadata(s3, authorsMetadataKey, {
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
