import { schedules } from "@trigger.dev/sdk/v3";
import {
  createBigQueryClient,
  createPostgresClient,
  resolveDumpDate,
} from "@/trigger/openlibrary/utils";
import { S3Client } from "./s3";
import { BigQuery } from "@google-cloud/bigquery";
import { getQueryForTarget, queries } from "./queries";
import { batchTriggerAndWait, triggerAndWait } from "../utils";
import { openLibraryRebuildSearchIndexesTask } from "./rebuild-search-indexes";
import { openLibrarySyncAuthorSearchTask } from "./sync-author-search";
import { openLibrarySyncTitleSearchTask } from "./sync-title-search";
import { openLibrarySyncWorkSearchTask } from "./sync-work-search";

const BIGQUERY_LOCATION = "us-west1";
const BIGQUERY_DATASET = "openlibrary";
const ETL_STATE_TABLE = `${BIGQUERY_DATASET}.etl_state`;
const TARGET_QUERY = "works_search_ready";
const ETL_PIPELINE = `openlibrary:${TARGET_QUERY}`;

async function runQuery(
  bigQuery: BigQuery,
  query: string,
  params?: Record<string, unknown>,
) {
  const [job] = await bigQuery.createQueryJob({
    query,
    params,
    location: BIGQUERY_LOCATION,
    useLegacySql: false,
  });

  const [rows] = await job.getQueryResults();
  return { job, rows };
}

async function clearOpenLibrarySyncTables() {
  const sql = createPostgresClient();
  try {
    await sql`TRUNCATE TABLE openlibrary_work_title_search, openlibrary_work_author_search, openlibrary_work_search`;
  } finally {
    await sql.end();
  }
}

async function dropOpenLibrarySyncIndexes() {
  const sql = createPostgresClient();
  try {
    await sql`DROP INDEX IF EXISTS idx_openlibrary_work_title_search_tsv`;
    await sql`DROP INDEX IF EXISTS idx_openlibrary_work_author_search_tsv`;
  } finally {
    await sql.end();
  }
}

async function setOpenLibrarySyncTablesUnlogged() {
  const sql = createPostgresClient();
  try {
    await sql`ALTER TABLE openlibrary_work_search SET UNLOGGED`;
    await sql`ALTER TABLE openlibrary_work_title_search SET UNLOGGED`;
    await sql`ALTER TABLE openlibrary_work_author_search SET UNLOGGED`;
  } finally {
    await sql.end();
  }
}

async function setOpenLibrarySyncTablesLogged() {
  const sql = createPostgresClient();
  try {
    await sql`ALTER TABLE openlibrary_work_search SET LOGGED`;
    await sql`ALTER TABLE openlibrary_work_title_search SET LOGGED`;
    await sql`ALTER TABLE openlibrary_work_author_search SET LOGGED`;
  } finally {
    await sql.end();
  }
}

async function countOpenLibrarySyncTables() {
  const sql = createPostgresClient();
  try {
    const rows = await sql`
      SELECT 'openlibrary_work_search' AS table_name, COUNT(*)::bigint AS row_count
      FROM openlibrary_work_search
      UNION ALL
      SELECT 'openlibrary_work_title_search' AS table_name, COUNT(*)::bigint AS row_count
      FROM openlibrary_work_title_search
      UNION ALL
      SELECT 'openlibrary_work_author_search' AS table_name, COUNT(*)::bigint AS row_count
      FROM openlibrary_work_author_search
    `;

    return {
      workCount: Number(
        rows.find((row) => row.table_name === "openlibrary_work_search")
          ?.row_count ?? 0,
      ),
      titleCount: Number(
        rows.find((row) => row.table_name === "openlibrary_work_title_search")
          ?.row_count ?? 0,
      ),
      authorCount: Number(
        rows.find((row) => row.table_name === "openlibrary_work_author_search")
          ?.row_count ?? 0,
      ),
    };
  } finally {
    await sql.end();
  }
}

async function ensureEtlStateTable(bigQuery: BigQuery) {
  await runQuery(
    bigQuery,
    `
      CREATE TABLE IF NOT EXISTS \`${ETL_STATE_TABLE}\` (
        pipeline STRING NOT NULL,
        dump_date STRING,
        status STRING NOT NULL,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP NOT NULL
      )
      CLUSTER BY pipeline;
    `,
  );
}

async function getLastSuccessfulDumpDate(bigQuery: BigQuery) {
  const { rows } = await runQuery(
    bigQuery,
    `
      SELECT dump_date
      FROM \`${ETL_STATE_TABLE}\`
      WHERE pipeline = @pipeline
        AND status = 'success'
      LIMIT 1;
    `,
    {
      pipeline: ETL_PIPELINE,
    },
  );

  const dumpDate = rows[0]?.dump_date;
  return typeof dumpDate === "string" ? dumpDate : null;
}

async function markDumpInProgress(bigQuery: BigQuery, dumpDate: string) {
  await runQuery(
    bigQuery,
    `
      MERGE \`${ETL_STATE_TABLE}\` AS target
      USING (
        SELECT
          @pipeline AS pipeline,
          @dumpDate AS dump_date
      ) AS source
      ON target.pipeline = source.pipeline
      WHEN MATCHED THEN
        UPDATE SET
          dump_date = source.dump_date,
          status = 'in_progress',
          started_at = CURRENT_TIMESTAMP(),
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN
        INSERT (pipeline, dump_date, status, started_at, completed_at, updated_at)
        VALUES (
          source.pipeline,
          source.dump_date,
          'in_progress',
          CURRENT_TIMESTAMP(),
          NULL,
          CURRENT_TIMESTAMP()
        );
    `,
    {
      pipeline: ETL_PIPELINE,
      dumpDate,
    },
  );
}

async function markDumpSuccessful(bigQuery: BigQuery, dumpDate: string) {
  await runQuery(
    bigQuery,
    `
      MERGE \`${ETL_STATE_TABLE}\` AS target
      USING (
        SELECT
          @pipeline AS pipeline,
          @dumpDate AS dump_date
      ) AS source
      ON target.pipeline = source.pipeline
      WHEN MATCHED THEN
        UPDATE SET
          dump_date = source.dump_date,
          status = 'success',
          completed_at = CURRENT_TIMESTAMP(),
          updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN
        INSERT (pipeline, dump_date, status, started_at, completed_at, updated_at)
        VALUES (
          source.pipeline,
          source.dump_date,
          'success',
          NULL,
          CURRENT_TIMESTAMP(),
          CURRENT_TIMESTAMP()
        );
    `,
    {
      pipeline: ETL_PIPELINE,
      dumpDate,
    },
  );
}

export const openLibraryEtlTask = schedules.task({
  id: "openlibrary-etl",
  cron: "0 9 * * *",
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async () => {
    console.log("Resolving latest dump date from OpenLibrary...");
    const dumpDate = await resolveDumpDate(
      "https://openlibrary.org/data/ol_dump_latest.txt.gz",
    );
    console.log(`Latest dump date: ${dumpDate}`);

    const bigQuery = createBigQueryClient();
    await ensureEtlStateTable(bigQuery);

    const lastSuccessfulDumpDate = await getLastSuccessfulDumpDate(bigQuery);
    if (lastSuccessfulDumpDate === dumpDate) {
      console.log(
        `Skipping OpenLibrary ETL because dump ${dumpDate} already completed successfully`,
      );
      return;
    }

    await markDumpInProgress(bigQuery, dumpDate);
    console.log(`Marked OpenLibrary ETL as in progress for dump ${dumpDate}`);
    console.log(`Downloading complete dump to google storage`);

    const csvKey = `openlibrary/all.csv`;
    const s3 = new S3Client("etl");
    let tablesSetUnlogged = false;

    try {
      // Skip download for now for testing
      // await triggerAndWait({
      //   task: openLibraryDownloadToS3Task,
      //   payload: {
      //     destinationKey: csvKey,
      //     sourceUrl: `https://openlibrary.org/data/ol_dump_latest.txt.gz`,
      //   },
      //   options: {
      //     machine: "medium-1x",
      //   },
      // });

      console.log(`Downloaded complete dump to google storage`);

      for (const runnableQueries of getQueryForTarget(queries, TARGET_QUERY)) {
        console.log(
          `Running BigQuery batch in ${BIGQUERY_LOCATION}: ${runnableQueries
            .map((query) => query.name)
            .join(", ")}`,
        );

        await Promise.all(
          runnableQueries.map(async (query) => {
            console.log(`Starting BigQuery query: ${query.name}`);

            const [job] = await bigQuery.createQueryJob({
              query: query.query,
              location: BIGQUERY_LOCATION,
            });

            await job.getQueryResults();
            console.log(`Completed BigQuery query: ${query.name} (${job.id})`);
          }),
        );
      }

      console.log(`Dropping Postgres OpenLibrary search indexes`);
      await dropOpenLibrarySyncIndexes();
      console.log(`Dropped Postgres OpenLibrary search indexes`);

      console.log(`Setting Postgres OpenLibrary sync tables UNLOGGED`);
      await setOpenLibrarySyncTablesUnlogged();
      tablesSetUnlogged = true;
      console.log(`Set Postgres OpenLibrary sync tables UNLOGGED`);

      console.log(`Clearing Postgres OpenLibrary sync tables`);
      await clearOpenLibrarySyncTables();
      console.log(`Cleared Postgres OpenLibrary sync tables`);

      const syncOutputs = await batchTriggerAndWait([
        {
          task: openLibrarySyncWorkSearchTask,
          payload: { dumpDate },
        },
        {
          task: openLibrarySyncTitleSearchTask,
          payload: { dumpDate },
        },
        {
          task: openLibrarySyncAuthorSearchTask,
          payload: { dumpDate },
        },
      ]);

      const counts = await countOpenLibrarySyncTables();
      console.log(
        `Postgres OpenLibrary counts: works=${counts.workCount}, titles=${counts.titleCount}, authors=${counts.authorCount}`,
      );

      if (
        counts.workCount === 0 ||
        counts.titleCount === 0 ||
        counts.authorCount === 0
      ) {
        throw new Error(
          `OpenLibrary Postgres sync produced an empty table: ${JSON.stringify(counts)}`,
        );
      }

      if (
        counts.workCount !== counts.titleCount ||
        counts.workCount !== counts.authorCount
      ) {
        throw new Error(
          `OpenLibrary Postgres sync row counts do not match: ${JSON.stringify(counts)}`,
        );
      }

      const insertedCounts = syncOutputs.map((output) => output.insertedCount);
      if (
        insertedCounts[0] !== counts.workCount ||
        insertedCounts[1] !== counts.titleCount ||
        insertedCounts[2] !== counts.authorCount
      ) {
        throw new Error(
          `OpenLibrary Postgres sync inserted counts do not match table counts: ${JSON.stringify({
            counts,
            insertedCounts,
          })}`,
        );
      }

      console.log(`Setting Postgres OpenLibrary sync tables LOGGED`);
      await setOpenLibrarySyncTablesLogged();
      tablesSetUnlogged = false;
      console.log(`Set Postgres OpenLibrary sync tables LOGGED`);

      await triggerAndWait({
        task: openLibraryRebuildSearchIndexesTask,
        payload: { dumpDate },
      });

      await markDumpSuccessful(bigQuery, dumpDate);
      console.log(`Recorded successful OpenLibrary dump ${dumpDate}`);
      console.log(`Completed BigQuery search table build: ${TARGET_QUERY}`);
    } finally {
      if (tablesSetUnlogged) {
        console.log(
          `Restoring Postgres OpenLibrary sync tables to LOGGED after interrupted sync`,
        );
        await setOpenLibrarySyncTablesLogged();
      }
      console.log(`Deleting ${csvKey} to save cloud storage costs`);
      // await s3.deleteObject(csvKey); // Since the file takes a long time, leave it there while testing. Remove this comment before production.
    }
  },
});
