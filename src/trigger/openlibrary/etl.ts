import { schedules } from "@trigger.dev/sdk/v3";
import { resolveDumpDate } from "@/trigger/openlibrary/utils";
import { BQClient } from "./bq";
import { getQueryForTarget, queries, renderSql } from "./queries";
import { triggerAndWait } from "../utils";
import { openLibraryDownloadToS3Task } from "./download-to-s3";
import { openLibrarySyncWorksForPostgresTask } from "./sync-works-for-postgres";
import { createPostgresWriteDb } from "@/db.node";
import { env } from "@/env.node";
import { z } from "zod/v4";

const TARGET_QUERY = "works_search_ready";
const DATASET = "openlibrary";

// Retention for this key is enforced by a bucket lifecycle rule
// (see infra/gcs-lifecycle.json), not by deleting it here — a failed run should
// be able to retry the BigQuery stage without re-downloading ~12GB.
const CSV_KEY = "openlibrary/all.csv";

const DUMP_URL = "https://openlibrary.org/data/ol_dump_latest.txt.gz";

export const openLibraryEtlTask = schedules.task({
  id: "openlibrary-etl",
  cron: "0 0 1 1 *", // Once a year to "disable" it
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async () => {
    const bq = new BQClient();
    const { sql, sqlTools } = createPostgresWriteDb();

    const sqlVariables = {
      project: bq.projectId,
      dataset: DATASET,
      bucket: env.ETL_S3_BUCKET,
      csvKey: CSV_KEY,
    };

    try {
      console.log("Resolving latest dump date from OpenLibrary...");
      const dumpDate = await resolveDumpDate(DUMP_URL);
      console.log(`Latest dump date: ${dumpDate}`);

      const lastSuccessfulDumpDate = await sqlTools.one(
        z.string(),
      )`SELECT openlibrary_etl_state()`;
      if (lastSuccessfulDumpDate === dumpDate) {
        console.log(
          `Skipping OpenLibrary ETL because dump ${dumpDate} already completed successfully`,
        );
        return;
      }

      console.log(
        `Previous ETL state: ${lastSuccessfulDumpDate}. Starting dump ${dumpDate}.`,
      );
      await sql`SELECT openlibrary_etl_state(${"in_progress"})`;

      try {
        console.log(`Downloading complete dump to google storage`);
        await triggerAndWait({
          task: openLibraryDownloadToS3Task,
          payload: {
            destinationKey: CSV_KEY,
            sourceUrl: DUMP_URL,
          },
          options: {
            machine: "medium-1x",
          },
        });
        console.log(`Downloaded complete dump to google storage`);

        for (const runnableQueries of getQueryForTarget(
          queries,
          TARGET_QUERY,
        )) {
          console.log(
            `Running BigQuery batch in ${bq.location}: ${runnableQueries
              .map((query) => query.name)
              .join(", ")}`,
          );

          await Promise.all(
            runnableQueries.map(async (query) => {
              console.log(`Starting BigQuery query: ${query.name}`);

              const job = await bq.createQueryJob(
                renderSql(query.query, sqlVariables),
              );
              await job.promise();

              console.log(
                `Completed BigQuery query: ${query.name} (${job.id})`,
              );
            }),
          );
        }

        await triggerAndWait({
          task: openLibrarySyncWorksForPostgresTask,
          payload: { dumpDate },
        });

        await sql`SELECT openlibrary_etl_state(${dumpDate})`;
        console.log(`Recorded successful OpenLibrary dump ${dumpDate}`);
        console.log(`Completed BigQuery search table build: ${TARGET_QUERY}`);
      } catch (e) {
        await sql`SELECT openlibrary_etl_state(${"failed"})`;
        throw e;
      }
    } finally {
      await sql.end();
    }
  },
});
