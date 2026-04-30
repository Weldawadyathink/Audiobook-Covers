import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { BQClient } from "./bq";
import { streamTracker, toPostgresCsvRow } from "./utils";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { pipeline } from "node:stream/promises";

export const openLibrarySyncTitleSearchTask = schemaTask({
  id: "openlibrary-sync-title-search",
  schema: z.object({
    dumpDate: z.string(),
  }),
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ dumpDate }) => {
    console.log(`Syncing title search rows for dump ${dumpDate}`);
    const { sql } = getDbWriteConnection(env);
    const bq = new BQClient();
    let insertedCount = 0;

    try {
      await sql`TRUNCATE TABLE openlibrary_work_title_search`;
      await sql`DROP INDEX IF EXISTS idx_openlibrary_work_title_search_tsv`;
      await sql`ALTER TABLE openlibrary_work_title_search SET UNLOGGED`;

      const bqStream = bq.queryStream(
        `
        SELECT
          olid,
          canonical_score,
          title_search_text
        FROM \`${bq.projectId}.openlibrary.works_title_search\`
      `,
      );
      const pgStream = await sql`
        COPY openlibrary_work_title_search (olid, canonical_score, title_search_text)
        FROM STDIN
        WITH (FORMAT csv, NULL '\N');
      `.writable();

      await pipeline(
        bqStream,
        streamTracker(100_000, (n) => {
          insertedCount = n;
          console.log(
            `Completed batch ${Math.ceil(n / 100_000)} for openlibrary_work_title_search (${n} rows)`,
          );
        }),
        toPostgresCsvRow(["olid", "canonical_score", "title_search_text"]),
        pgStream,
      );

      console.log(
        `Synced ${insertedCount} title search rows for dump ${dumpDate}`,
      );

      console.log(`Creating index for openlibrary_work_title_search_tsv`);
      await sql`
        CREATE INDEX IF NOT EXISTS idx_openlibrary_work_title_search_tsv
        ON openlibrary_work_title_search
        USING gin (to_tsvector('simple', title_search_text))
      `;
      console.log(`Index created for openlibrary_work_title_search_tsv`);

      await sql`ALTER TABLE openlibrary_work_title_search SET LOGGED`;
      console.log(`Table openlibrary_work_title_search set to logged`);

      return { dumpDate, insertedCount };
    } finally {
      await sql.end();
    }
  },
});
