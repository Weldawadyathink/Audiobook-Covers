import { schedules } from "@trigger.dev/sdk/v3";
import { resolveDumpDate } from "@/trigger/openlibrary/utils";
import { S3Client } from "./s3";
import { BigQuery } from "@google-cloud/bigquery";
import { getQueryForTarget, queries } from "./queries";
import { env } from "@/env";

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

function createBigQueryClient() {
  const credentials = env.BIGQUERY_CREDENTIALS_JSON;
  return new BigQuery({
    location: BIGQUERY_LOCATION,
    ...(credentials
      ? {
          credentials,
          projectId: credentials.project_id,
        }
      : {}),
  });
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

      await markDumpSuccessful(bigQuery, dumpDate);
      console.log(`Recorded successful OpenLibrary dump ${dumpDate}`);
      console.log(`Completed BigQuery search table build: ${TARGET_QUERY}`);
    } finally {
      console.log(`Deleting ${csvKey} to save cloud storage costs`);
      // await s3.deleteObject(csvKey); // Since the file takes a long time, leave it there while testing. Remove this comment before production.
    }
  },
});
