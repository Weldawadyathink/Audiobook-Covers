import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createPostgresClient } from "./utils";

const OpenLibrarySyncPayload = z.object({
  dumpDate: z.string(),
});

export const openLibraryRebuildSearchIndexesTask = schemaTask({
  id: "openlibrary-rebuild-search-indexes",
  schema: OpenLibrarySyncPayload,
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ dumpDate }) => {
    console.log(`Rebuilding search indexes for dump ${dumpDate}`);
    const sql = createPostgresClient();

    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_openlibrary_work_title_search_tsv
        ON openlibrary_work_title_search
        USING gin (to_tsvector('simple', title_search_text))
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_openlibrary_work_author_search_tsv
        ON openlibrary_work_author_search
        USING gin (to_tsvector('simple', author_search_text))
      `;
    } finally {
      await sql.end();
    }

    console.log(`Rebuilt search indexes for dump ${dumpDate}`);
    return { dumpDate };
  },
});
