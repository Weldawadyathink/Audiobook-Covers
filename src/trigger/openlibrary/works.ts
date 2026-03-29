import { task, tasks } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  getStoredMetadata,
  putMetadata,
  deleteMetadata,
  worksParquetFile,
  worksMetadataKey,
  enrichedMetadataKey,
  worksDumpUrl,
} from "./utils";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import { env } from "@/env";
import { ResourceMonitor } from "../resourceMonitor";
import { olQueue } from "./etl";

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  resourceMonitor.startMonitoring(10_000);
  await next();
  resourceMonitor.stopMonitoring();
});

export const openLibraryWorksTask = task({
  id: "openlibrary-works",
  machine: "small-2x",
  retry: {
    maxAttempts: 1,
  },
  queue: olQueue,
  run: async ({ dumpDate }: { dumpDate: string }) => {
    const s3 = makeS3Client();

    const stored = await getStoredMetadata(s3, worksMetadataKey);
    if (stored !== null && stored.dump_date === dumpDate) {
      console.log(`Works already imported for ${dumpDate}. Skipping.`);
      return { row_count: stored.row_count ?? 0 };
    }

    // Invalidate enriched before writing new works so a crash mid-run
    // doesn't leave stale enriched data marked as current.
    await deleteMetadata(s3, enrichedMetadataKey);
    await deleteMetadata(s3, worksMetadataKey);

    const tmpDir = "/tmp/works";
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

      console.log("Downloading works dump and copying to S3 parquet");
      await con.run(`
        COPY (
          SELECT
            replace(json_extract_string(data, '$.key'), '/works/', '') AS olid,
            json_extract_string(data, '$.title')                       AS title,
            json_extract_string(data, '$.subtitle')                    AS subtitle,
            json_extract(data, '$.authors')::VARCHAR                   AS authors,
            json_extract(data, '$.translated_titles')::VARCHAR         AS translated_titles,
            coalesce(json_extract(data, '$.subjects')::VARCHAR[],        []::VARCHAR[]) AS subjects,
            coalesce(json_extract(data, '$.subject_places')::VARCHAR[],  []::VARCHAR[]) AS subject_places,
            coalesce(json_extract(data, '$.subject_times')::VARCHAR[],   []::VARCHAR[]) AS subject_times,
            coalesce(json_extract(data, '$.subject_people')::VARCHAR[],  []::VARCHAR[]) AS subject_people,
            CASE json_type(data, '$.description')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.description')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.description.value')
            END AS description,
            coalesce(json_extract(data, '$.dewey_number')::VARCHAR[],       []::VARCHAR[]) AS dewey_number,
            coalesce(json_extract(data, '$.lc_classifications')::VARCHAR[], []::VARCHAR[]) AS lc_classifications,
            CASE json_type(data, '$.first_sentence')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.first_sentence')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.first_sentence.value')
            END AS first_sentence,
            json_extract(data, '$.original_languages')::VARCHAR AS original_languages,
            coalesce(json_extract(data, '$.other_titles')::VARCHAR[], []::VARCHAR[]) AS other_titles,
            json_extract_string(data, '$.first_publish_date')   AS first_publish_date,
            json_extract(data, '$.links')::VARCHAR               AS links,
            CASE json_type(data, '$.notes')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.notes')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.notes.value')
            END AS notes,
            json_extract_string(data, '$.cover_edition.key')    AS cover_edition,
            coalesce(json_extract(data, '$.covers')::BIGINT[], []::BIGINT[]) AS covers
          FROM read_csv(
            '${worksDumpUrl}',
            sep           = '\t',
            header        = false,
            quote         = '',
            columns       = {type: 'VARCHAR', key: 'VARCHAR', revision: 'VARCHAR',
                             last_modified: 'VARCHAR', data: 'VARCHAR'},
            ignore_errors = true
          )
        ) TO '${worksParquetFile}' (FORMAT PARQUET, COMPRESSION ZSTD)
      `);

      const result = await con.run(
        `SELECT count(*) FROM '${worksParquetFile}'`,
      );
      const rows = await result.getRows();
      const rowCount = Number(rows[0][0]);
      console.log(
        `Wrote ${rowCount.toLocaleString()} works rows to Parquet in S3`,
      );

      await putMetadata(s3, worksMetadataKey, {
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
