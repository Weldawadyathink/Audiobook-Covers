import { schedules } from "@trigger.dev/sdk/v3";
import { resolveDumpDate } from "@/trigger/openlibrary/utils";
import { openLibraryCsvToParquetTask } from "@/trigger/openlibrary/csv-to-parquet";
import { openLibraryNormalizeTask } from "@/trigger/openlibrary/normalize";
import { batchTriggerAndWait } from "@/trigger/utils";

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

    console.log(`Spawning normalization tasks`);
    await batchTriggerAndWait([
      {
        task: openLibraryNormalizeTask,
        payload: {
          source: "openlibrary/works",
          target: "openlibrary/works_normalized",
          dumpDate,
          queryToUse: "works",
        },
        options: {
          // Works with medium-2x
          machine: "medium-2x",
        },
      },
      {
        task: openLibraryNormalizeTask,
        payload: {
          source: "openlibrary/authors",
          target: "openlibrary/authors_normalized",
          dumpDate,
          queryToUse: "authors",
        },
        options: {
          // Fine with small-2x, also small-1x with set memory limits
          machine: "small-1x",
        },
      },
      {
        task: openLibraryNormalizeTask,
        payload: {
          source: "openlibrary/editions",
          target: "openlibrary/editions_normalized",
          dumpDate,
          queryToUse: "editions",
        },
        options: {
          machine: "medium-2x",
        },
      },
    ]);

    console.log(`ETL workflow completed for ${dumpDate}`);
  },
});
