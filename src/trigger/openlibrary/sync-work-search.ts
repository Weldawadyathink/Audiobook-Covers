import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { BQClient } from "./bq";
import { streamTracker, toPostgresCsvRow } from "./utils";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { pipeline } from "node:stream/promises";

export const openLibrarySyncWorkSearchTask = schemaTask({
  id: "openlibrary-sync-work-search",
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
    console.log(`Syncing works search rows for dump ${dumpDate}`);
    const { sql } = getDbWriteConnection(env);
    const bq = new BQClient();
    let insertedCount = 0;

    try {
      await sql`TRUNCATE TABLE openlibrary_work_search`;
      await sql`DROP INDEX IF EXISTS idx_openlibrary_work_search_olid`;
      await sql`ALTER TABLE openlibrary_work_search SET UNLOGGED`;

      const bqStream = bq.queryStream(
        `
        SELECT
          olid,
          canonical_score,
          title,
          subtitle,
          title_aliases,
          author_names,
          author_alternate_names,
          first_publish_date,
          first_edition_publish_year,
          latest_edition_publish_year,
          edition_count,
          subjects,
          description,
          publishers,
          language_ids
        FROM \`${bq.projectId}.openlibrary.works_search\`
      `,
      );
      const pgStream = await sql`
        COPY openlibrary_work_search (
          olid,
          canonical_score,
          title,
          subtitle,
          title_aliases,
          author_names,
          author_alternate_names,
          first_publish_date,
          first_edition_publish_year,
          latest_edition_publish_year,
          edition_count,
          subjects,
          description,
          publishers,
          language_ids
        )
        FROM STDIN
        WITH (FORMAT csv, NULL '\N');
      `.writable();

      await pipeline(
        bqStream,
        streamTracker(100_000, (n) => {
          console.log(
            `Completed batch ${Math.ceil(n / 100_000)} for openlibrary_work_search (${n} rows)`,
          );
        }),
        toPostgresCsvRow([
          "olid",
          "canonical_score",
          "title",
          "subtitle",
          "title_aliases",
          "author_names",
          "author_alternate_names",
          "first_publish_date",
          "first_edition_publish_year",
          "latest_edition_publish_year",
          "edition_count",
          "subjects",
          "description",
          "publishers",
          "language_ids",
        ]),
        pgStream,
      );
      console.log(
        `Synced ${insertedCount} author search rows for dump ${dumpDate}`,
      );

      console.log(`Creating index for openlibrary_work_author_search_tsv`);
      await sql`
        CREATE INDEX IF NOT EXISTS idx_openlibrary_work_search_olid
        ON openlibrary_work_search
        USING btree (olid);
      `;
      console.log(`Index created for openlibrary_work_author_search_tsv`);

      await sql`ALTER TABLE openlibrary_work_search SET LOGGED`;
      console.log(`Table openlibrary_work_search set to logged`);

      return { dumpDate, insertedCount };
    } finally {
      await sql.end();
    }
  },
});
