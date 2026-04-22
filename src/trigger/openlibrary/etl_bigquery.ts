import { schedules } from "@trigger.dev/sdk/v3";
import { resolveDumpDate } from "@/trigger/openlibrary/utils";
import { openLibraryDownloadToS3Task } from "./download-to-s3";
import { batchTriggerAndWait, triggerAndWait } from "@/trigger/utils";
import { S3Client } from "./s3";
import { BigQuery } from "@google-cloud/bigquery";

export const openLibraryEtlTask = schedules.task({
  id: "openlibrary-etl",
  cron: "0 9 * * *",
  machine: "micro",
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

    const csvKey = `openlibrary/${dumpDate}.csv`;
    const s3 = new S3Client("etl");

    try {
      await triggerAndWait(openLibraryDownloadToS3Task, {
        destinationKey: csvKey,
        sourceUrl: `https://openlibrary.org/data/ol_dump_latest.txt.gz`,
      });

      console.log(`Downloaded complete dump to google storage`);
    } catch (error) {
      console.log(`Deleting ${csvKey} due to error`);
      // await s3.deleteObject(csvKey); // Since the file takes a long time, leave it there while testing. Remove this comment before production.
      console.error(error);
      throw error;
    }
  },
});
