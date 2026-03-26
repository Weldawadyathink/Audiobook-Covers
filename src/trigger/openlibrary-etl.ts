import { schedules, queue } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  getStoredMetadata,
  putMetadata,
  resolveDumpDate,
  deleteS3Prefix,
  worksDumpUrl,
  etlMetadataKey,
  authorsMetadataKey,
  worksMetadataKey,
  enrichedMetadataKey,
  enrichTmpChunkPrefix,
} from "./openlibrary-utils";
import { openLibraryWorksTask } from "./openlibrary-works";
import { openLibraryAuthorsTask } from "./openlibrary-authors";
import { openLibraryEnrichTask } from "./openlibrary-enrich";
import { openLibraryEnrichCombineTask } from "./openlibrary-enrich-combine";
import { triggerAndWait, batchTriggerAndWait } from "./utils";

export const olQueue = queue({
  name: "OpenLibrary Queue",
  concurrencyLimit: 1,
});

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
    const s3 = makeS3Client();

    console.log("Resolving latest dump date from OpenLibrary...");
    const dumpDate = await resolveDumpDate(worksDumpUrl);
    console.log(`Latest dump date: ${dumpDate}`);

    // Fast-exit: check each step's own metadata so that manually deleting any
    // one of them causes only that step (and its dependents) to re-run.
    const [authorsState, worksState, enrichedState] = await Promise.all([
      getStoredMetadata(s3, authorsMetadataKey),
      getStoredMetadata(s3, worksMetadataKey),
      getStoredMetadata(s3, enrichedMetadataKey),
    ]);

    if (
      authorsState?.dump_date === dumpDate &&
      worksState?.dump_date === dumpDate &&
      enrichedState?.dump_date === dumpDate
    ) {
      console.log(`All steps already complete for ${dumpDate}. Skipping.`);
      return;
    }

    console.log("Triggering works and authors tasks");
    await batchTriggerAndWait([
      {
        task: openLibraryWorksTask,
        payload: { dumpDate },
      },
      {
        task: openLibraryAuthorsTask,
        payload: { dumpDate },
      },
    ]);

    console.log("Clearing enrich tmp chunks...");
    await deleteS3Prefix(s3, enrichTmpChunkPrefix);

    console.log("Triggering enrichment...");
    await triggerAndWait(openLibraryEnrichTask, { dumpDate });

    console.log("Triggering enrich combine...");
    await triggerAndWait(openLibraryEnrichCombineTask, { dumpDate });

    await putMetadata(s3, etlMetadataKey, {
      dump_date: dumpDate,
      updated_at: new Date().toISOString(),
    });
    console.log(`ETL metadata written for dump ${dumpDate}`);
  },
});
