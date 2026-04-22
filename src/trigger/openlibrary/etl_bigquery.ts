import { schedules } from "@trigger.dev/sdk/v3";
import { resolveDumpDate } from "@/trigger/openlibrary/utils";
import { S3Client } from "./s3";
import { BigQuery } from "@google-cloud/bigquery";
import { getQueryForTarget, queries } from "./queries";
import { getBigQueryCredentials } from "@/env";

const BIGQUERY_LOCATION = "us-west1";
const TARGET_QUERY = "works_search";

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

      const credentials = getBigQueryCredentials();
      const bigQuery = new BigQuery({
        location: BIGQUERY_LOCATION,
        ...(credentials
          ? {
              credentials,
              projectId: credentials.project_id,
            }
          : {}),
      });

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

      console.log(`Completed BigQuery search table build: ${TARGET_QUERY}`);
    } finally {
      console.log(`Deleting ${csvKey} to save cloud storage costs`);
      // await s3.deleteObject(csvKey); // Since the file takes a long time, leave it there while testing. Remove this comment before production.
    }
  },
});
