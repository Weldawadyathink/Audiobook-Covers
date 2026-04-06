import { schedules } from "@trigger.dev/sdk/v3";
import { resolveDumpDate } from "./utils";
import { openLibraryCsvToParquetTask } from "./csv-to-parquet";
import { batchTriggerAndWait } from "../utils";

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
    console.log(`Spawning csv to parquet tasks`);

    await batchTriggerAndWait([
      {
        task: openLibraryCsvToParquetTask,
        payload: {
          source: "https://openlibrary.org/data/ol_dump_works_latest.txt.gz",
          target: "openlibrary/works",
          dumpDate,
        },
        options: {
          machine: "small-2x",
        },
      },
      {
        task: openLibraryCsvToParquetTask,
        payload: {
          source: "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz",
          target: "openlibrary/authors",
          dumpDate,
        },
        options: {
          machine: "small-2x",
        },
      },
      {
        task: openLibraryCsvToParquetTask,
        payload: {
          source: "https://openlibrary.org/data/ol_dump_editions_latest.txt.gz",
          target: "openlibrary/editions",
          dumpDate,
        },
        options: {
          machine: "small-2x",
        },
      },
    ]);

    console.log(`ETL workflow completed for ${dumpDate}`);
  },
});
