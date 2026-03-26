import { schedules, tasks, queue } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  getStoredMetadata,
  putMetadata,
  resolveDumpDate,
  worksDumpUrl,
  etlMetadataKey,
  authorsMetadataKey,
  worksMetadataKey,
  enrichedMetadataKey,
} from "./openlibrary-utils";
import type { openLibraryWorksTask } from "./openlibrary-works";
import type { openLibraryAuthorsTask } from "./openlibrary-authors";
import type { openLibraryEnrichTask } from "./openlibrary-enrich";

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

    console.log("Triggering authors task...");
    const authorsResult = await tasks.triggerAndWait<typeof openLibraryAuthorsTask>(
      "openlibrary-authors",
      { dumpDate },
    );
    if (!authorsResult.ok) {
      throw new Error(`Authors task failed: ${JSON.stringify(authorsResult.error)}`);
    }

    console.log("Triggering works task...");
    const worksResult = await tasks.triggerAndWait<typeof openLibraryWorksTask>(
      "openlibrary-works",
      { dumpDate },
    );
    if (!worksResult.ok) {
      throw new Error(`Works task failed: ${JSON.stringify(worksResult.error)}`);
    }

    console.log("Triggering enrichment...");
    const enrichResult = await tasks.triggerAndWait<typeof openLibraryEnrichTask>(
      "openlibrary-enrich",
      { dumpDate },
    );
    if (!enrichResult.ok) {
      throw new Error(`Enrich task failed: ${JSON.stringify(enrichResult.error)}`);
    }
    console.log("Enrichment complete.");

    await putMetadata(s3, etlMetadataKey, {
      dump_date: dumpDate,
      updated_at: new Date().toISOString(),
    });
    console.log(`ETL metadata written for dump ${dumpDate}`);
  },
});
