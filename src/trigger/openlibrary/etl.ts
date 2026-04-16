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
          target: "openlibrary/works/raw",
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
          target: "openlibrary/authors/raw",
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
          target: "openlibrary/editions/raw",
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
          source: "openlibrary/works/raw",
          target: "openlibrary/works/normalized/data",
          dumpDate,
          queryToUse: "works",
          rowsPerBatch: 250_000,
        },
      },
      {
        task: openLibraryNormalizeTask,
        payload: {
          source: "openlibrary/authors/raw",
          target: "openlibrary/authors/normalized/data",
          dumpDate,
          queryToUse: "authors",
          rowsPerBatch: 250_000,
        },
      },
      {
        task: openLibraryNormalizeTask,
        payload: {
          source: "openlibrary/editions/raw",
          target: "openlibrary/editions/normalized/data",
          dumpDate,
          queryToUse: "editions",
          rowsPerBatch: 50_000,
          machineSize: "medium-1x",
        },
      },
    ]);

    console.log(`ETL workflow completed for ${dumpDate}`);
  },
});
