import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  createBigQueryClient,
  createPostgresClient,
  copyBigQueryRowsToPostgres,
} from "./utils";

const BIGQUERY_PROJECT = "audiobookcovers-487104";

type OpenLibraryTitleSearchRow = {
  olid: string;
  canonical_score: number;
  title_search_text: string;
};

const OpenLibrarySyncPayload = z.object({
  dumpDate: z.string(),
});

export const openLibrarySyncTitleSearchTask = schemaTask({
  id: "openlibrary-sync-title-search",
  schema: OpenLibrarySyncPayload,
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ dumpDate }) => {
    console.log(`Syncing title search rows for dump ${dumpDate}`);
    const sql = createPostgresClient();
    const bigQuery = createBigQueryClient();

    try {
      const insertedCount =
        await copyBigQueryRowsToPostgres<OpenLibraryTitleSearchRow>({
          bigQuery,
          sql,
          bigQueryQuery: `
          SELECT
            olid,
            canonical_score,
            title_search_text
          FROM \`${BIGQUERY_PROJECT}.openlibrary.works_title_search\`
          ORDER BY olid
        `,
          tableName: "openlibrary_work_title_search",
          columns: ["olid", "canonical_score", "title_search_text"],
          mapRow: (row) => ({
            olid: row.olid,
            canonical_score: Number(row.canonical_score ?? 0),
            title_search_text: row.title_search_text ?? "",
          }),
        });

      console.log(
        `Synced ${insertedCount} title search rows for dump ${dumpDate}`,
      );
      return { dumpDate, insertedCount };
    } finally {
      await sql.end();
    }
  },
});
