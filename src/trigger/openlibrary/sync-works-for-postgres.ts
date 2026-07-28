import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import prettyMilliseconds from "pretty-ms";
import formatNumber from "format-number";
import { BQClient } from "./bq";
import { S3Client } from "./s3";
import { createPostgresWriteDb } from "@/db.node";
import { streamTracker } from "./utils";

const format = formatNumber({ round: 0 });
const DATASET = "openlibrary";
const CURRENT_TABLE = "works_for_postgres";

/**
 * Checkpoint of what Postgres already has, as `(olid, row_hash)` only.
 *
 * The delta query reads the synced side for exactly two things: `olid` (to find
 * deletes) and `row_hash` (to find changes). Carrying the other nine columns
 * made this a full second copy of works_for_postgres that was rescanned on every
 * run for no benefit.
 *
 * Named `_hashes` rather than reusing `works_for_postgres_synced` so the shape
 * change is explicit — the old full-copy table is dropped by the ETL cleanup.
 */
const SYNCED_TABLE = "works_for_postgres_synced_hashes";

const importedColumnNames = [
  "olid",
  "title",
  "subtitle",
  "author_names",
  "author_aliases",
  "title_aliases",
  "subjects",
  "description",
  "first_publish_year",
  "edition_count",
  "canonical_score",
] as const;

/**
 * Columns that feed row_hash — everything carried to Postgres except the join
 * key. Changing this list changes every hash, so the next run sees the whole
 * table as modified and re-upserts it. That is correct (the payload really did
 * change) but expensive; expect it when adding a column.
 */
const hashedColumnNames = importedColumnNames.filter(
  (columnName) => columnName !== "olid",
);

const importedColumns = importedColumnNames.join(",\n      ");

function qualifiedImportedColumns(tableAlias: string) {
  return importedColumnNames
    .map((columnName) => `${tableAlias}.${columnName}`)
    .join(",\n              ");
}

function currentRowsWithHash(tableName: string) {
  return `
    SELECT
      ${importedColumns},
      TO_HEX(SHA256(TO_JSON_STRING(STRUCT(
        ${hashedColumnNames.join(",\n        ")}
      )))) AS row_hash
    FROM \`${tableName}\`
  `;
}

function csvJsonLine(json: string) {
  return `"${json.replaceAll('"', '""')}"\n`;
}

async function* streamJsonExportAsCsv(s3: S3Client, prefix: string) {
  const objects = await s3.listObjects(prefix);

  for (const object of objects) {
    const source = await s3.getObjectStream(object.key);
    const stream = source.pipe(createGunzip()).setEncoding("utf8");
    let buffer = "";

    for await (const chunk of stream) {
      buffer += chunk;

      for (;;) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) break;

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) {
          yield csvJsonLine(line);
        }
      }
    }

    const finalLine = buffer.trim();
    if (finalLine.length > 0) {
      yield csvJsonLine(finalLine);
    }
  }
}

export const openLibrarySyncWorksForPostgresTask = schemaTask({
  id: "openlibrary-sync-works-for-postgres",
  schema: z.object({
    dumpDate: z.string(),
  }),
  machine: "micro",
  maxDuration: 12 * 60 * 60,
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ dumpDate }) => {
    console.log(`Syncing works_for_postgres rows for dump ${dumpDate}`);
    const bq = new BQClient();
    const s3 = new S3Client("etl");
    const { sql } = createPostgresWriteDb();
    const exportPrefix = "exports/works-for-postgres/";

    const currentTable = `${bq.projectId}.${DATASET}.${CURRENT_TABLE}`;
    const syncedTable = `${bq.projectId}.${DATASET}.${SYNCED_TABLE}`;

    try {
      await s3.clearDirectory(exportPrefix);

      console.log(`Ensuring BigQuery checkpoint table ${syncedTable}`);
      const ensureCheckpointJob = await bq.createQueryJob(`
        CREATE TABLE IF NOT EXISTS \`${syncedTable}\` (
          olid STRING,
          row_hash STRING
        )
        CLUSTER BY olid
      `);
      await ensureCheckpointJob.promise();

      // An empty checkpoint means every row exports as an upsert. That is a
      // legitimate first run, but it is also what a lost checkpoint looks like,
      // so make the number visible before the write rather than after.
      const [checkpointStats] = await bq.query<{ row_count: number }>(`
        SELECT COUNT(*) AS row_count FROM \`${syncedTable}\`
      `);
      console.log(
        `Checkpoint holds ${format(Number(checkpointStats?.row_count ?? 0))} previously synced rows`,
      );

      console.log(`Exporting BigQuery works_for_postgres deltas`);
      const exportJob = await bq.createQueryJob(`
        EXPORT DATA OPTIONS (
          uri = 'gs://${s3.bucket}/${exportPrefix}*.json.gz',
          format = 'JSON',
          compression = 'GZIP',
          overwrite = true
        ) AS
        WITH
          current_rows AS (
            ${currentRowsWithHash(currentTable)}
          ),
          synced_rows AS (
            SELECT olid, row_hash FROM \`${syncedTable}\`
          ),
          upserts AS (
            SELECT
              'upsert' AS change_type,
              ${qualifiedImportedColumns("current_rows")}
            FROM current_rows
            LEFT JOIN synced_rows USING (olid)
            WHERE synced_rows.olid IS NULL
               OR current_rows.row_hash != synced_rows.row_hash
          ),
          deletes AS (
            SELECT
              'delete' AS change_type,
              synced_rows.olid,
              CAST(NULL AS STRING) AS title,
              CAST(NULL AS STRING) AS subtitle,
              CAST([] AS ARRAY<STRING>) AS author_names,
              CAST([] AS ARRAY<STRING>) AS author_aliases,
              CAST([] AS ARRAY<STRING>) AS title_aliases,
              CAST([] AS ARRAY<STRING>) AS subjects,
              CAST(NULL AS STRING) AS description,
              CAST(NULL AS INT64) AS first_publish_year,
              CAST(NULL AS INT64) AS edition_count,
              CAST(NULL AS INT64) AS canonical_score
            FROM synced_rows
            LEFT JOIN current_rows USING (olid)
            WHERE current_rows.olid IS NULL
          )
        SELECT * FROM upserts
        UNION ALL
        SELECT * FROM deletes
      `);
      await exportJob.promise();
      console.log(`Exported BigQuery works_for_postgres deltas`);

      const startedAt = performance.now();
      const result = await sql.begin(async (tx) => {
        await tx.unsafe(`
          CREATE TEMP TABLE openlibrary_work_import_stage (
            payload JSONB NOT NULL
          ) ON COMMIT DROP
        `);

        const copyStream = await tx
          .unsafe(
            `
          COPY openlibrary_work_import_stage (payload)
          FROM STDIN
          WITH (FORMAT csv)
        `,
          )
          .writable();
        await pipeline(
          Readable.from(streamJsonExportAsCsv(s3, exportPrefix)),
          streamTracker(100_000, (n, t, rowsSinceLastCall) => {
            console.log(
              `Completed ${format(n)} rows in ${prettyMilliseconds(t)} (${format((rowsSinceLastCall / t) * 1000)} rows/sec)`,
            );
          }),
          copyStream,
        );

        console.log(`Completed stream to temporary table`);

        const [stageStats] = await tx.unsafe<
          [{ total: number; upserts: number; deletes: number }]
        >(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE payload->>'change_type' = 'upsert')::int AS upserts,
            COUNT(*) FILTER (WHERE payload->>'change_type' = 'delete')::int AS deletes
          FROM openlibrary_work_import_stage
        `);

        console.log(
          `Stage stats: total=${stageStats.total}, upserts=${stageStats.upserts}, deletes=${stageStats.deletes}`,
        );

        console.log(`Deleting ${format(stageStats.deletes)} rows`);
        const deleteResult = await tx.unsafe(`
          WITH deleted AS (
            SELECT payload->>'olid' AS olid
            FROM openlibrary_work_import_stage
            WHERE payload->>'change_type' = 'delete'
          )
          DELETE FROM openlibrary_work work
          USING deleted
          WHERE work.olid = deleted.olid
        `);
        console.log(`Deletion complete`);

        console.log(`Upserting ${format(stageStats.upserts)} rows`);
        const upsertResult = await tx.unsafe(`
          WITH upsert_rows AS (
            SELECT
              payload->>'olid' AS olid,
              payload->>'title' AS title,
              payload->>'subtitle' AS subtitle,
              ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(payload->'author_names', '[]'::jsonb))
              ) AS author_names,
              ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(payload->'author_aliases', '[]'::jsonb))
              ) AS author_aliases,
              ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(payload->'title_aliases', '[]'::jsonb))
              ) AS title_aliases,
              ARRAY(
                SELECT jsonb_array_elements_text(COALESCE(payload->'subjects', '[]'::jsonb))
              ) AS subjects,
              payload->>'description' AS description,
              (payload->>'first_publish_year')::int AS first_publish_year,
              (payload->>'edition_count')::int AS edition_count,
              (payload->>'canonical_score')::int AS canonical_score
            FROM openlibrary_work_import_stage
            WHERE payload->>'change_type' = 'upsert'
          )
          INSERT INTO openlibrary_work (
            olid,
            title,
            subtitle,
            author_names,
            author_aliases,
            title_aliases,
            subjects,
            description,
            first_publish_year,
            edition_count,
            canonical_score
          )
          SELECT
            olid,
            title,
            subtitle,
            author_names,
            author_aliases,
            title_aliases,
            subjects,
            description,
            first_publish_year,
            edition_count,
            canonical_score
          FROM upsert_rows
          -- No WHERE guard here: the BigQuery export already diffed on row_hash,
          -- so every staged upsert is known to differ. Guarding again only made
          -- upsertResult.count under-report what was applied.
          ON CONFLICT (olid) DO UPDATE SET
            title = EXCLUDED.title,
            subtitle = EXCLUDED.subtitle,
            author_names = EXCLUDED.author_names,
            author_aliases = EXCLUDED.author_aliases,
            title_aliases = EXCLUDED.title_aliases,
            subjects = EXCLUDED.subjects,
            description = EXCLUDED.description,
            first_publish_year = EXCLUDED.first_publish_year,
            edition_count = EXCLUDED.edition_count,
            canonical_score = EXCLUDED.canonical_score
        `);
        console.log(`Upsert complete`);

        return {
          stageStats,
          deletedCount: deleteResult.count,
          upsertedCount: upsertResult.count,
        };
      });

      console.log(
        `Imported ${format(result.stageStats.total)} delta rows in ${prettyMilliseconds(
          performance.now() - startedAt,
        )}: ${format(result.upsertedCount ?? 0)} upserts applied, ${format(
          result.deletedCount ?? 0,
        )} deletes applied`,
      );

      console.log(`Advancing BigQuery checkpoint table ${syncedTable}`);
      const advanceCheckpointJob = await bq.createQueryJob(`
        CREATE OR REPLACE TABLE \`${syncedTable}\`
        CLUSTER BY olid AS
        SELECT olid, row_hash
        FROM (
          ${currentRowsWithHash(currentTable)}
        )
      `);
      await advanceCheckpointJob.promise();

      return {
        dumpDate,
        totalDeltaRows: result.stageStats.total,
        upsertsExported: result.stageStats.upserts,
        deletesExported: result.stageStats.deletes,
        upsertsApplied: result.upsertedCount ?? 0,
        deletesApplied: result.deletedCount ?? 0,
      };
    } finally {
      // Exported shards are swept by the bucket lifecycle rule (see
      // infra/gcs-lifecycle.json) rather than deleted here, so a failed run can
      // be retried against the already-exported delta.
      await sql.end();
    }
  },
});
