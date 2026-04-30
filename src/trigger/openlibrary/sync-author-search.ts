import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { BQClient } from "./bq";
import { streamTracker, toPostgresCsvRow } from "./utils";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { pipeline } from "node:stream/promises";

const OpenLibrarySyncPayload = z.object({
  dumpDate: z.string(),
});

export const openLibrarySyncAuthorSearchTask = schemaTask({
  id: "openlibrary-sync-author-search",
  schema: OpenLibrarySyncPayload,
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ dumpDate }) => {
    console.log(`Syncing author search rows for dump ${dumpDate}`);
    const { sql } = getDbWriteConnection(env);
    const bq = new BQClient();

    try {
      await sql`TRUNCATE TABLE openlibrary_work_author_search`;
      await sql`DELETE INDEX IF EXISTS idx_openlibrary_work_author_search_tsv`;

      const bqStream = bq.queryStream(
        `
        SELECT
          olid,
          canonical_score,
          author_search_text
        FROM \`${bq.projectId}.openlibrary.works_author_search\`
        WHERE dump_date = '${dumpDate}'
        ORDER BY olid
      `,
      );
      const pgStream = await sql`
        COPY openlibrary_work_author_search (olid, canonical_score, author_search_text)
        FROM STDIN
        WITH (FORMAT csv, NULL '\N');
      `.writable();

      await pipeline(
        bqStream,
        streamTracker(100_000, (n) => console.log(`Processed ${n}`)),
        toPostgresCsvRow(["olid", "canonical_score", "author_search_text"]),
        pgStream,
      );

      await sql`
        CREATE INDEX IF NOT EXISTS idx_openlibrary_work_author_search_tsv
        ON openlibrary_work_author_search
        USING gin (to_tsvector('simple', author_search_text))
      `;
    } finally {
      await sql.end();
    }
  },
});
