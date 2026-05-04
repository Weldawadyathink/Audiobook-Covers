import { schemaTask, tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { BQClient } from "./bq";
import { streamTracker, toPostgresCsvRow } from "./utils";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { pipeline } from "node:stream/promises";
import prettyMilliseconds from "pretty-ms";
import { ResourceMonitor } from "../resourceMonitor";
import formatNumber from "format-number";

const format = formatNumber({ round: 0 });

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({
    ctx,
  });
  resourceMonitor.startMonitoring(10_000);

  await next();

  resourceMonitor.stopMonitoring();
});

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
      await sql`SELECT openlibrary_work_search_set_indexed(false)`;

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
        streamTracker(100_000, (n, t) => {
          insertedCount = n;
          console.log(
            `Completed ${format(n)} rows in ${prettyMilliseconds(t)} (${format((n / t) * 1000)} rows/sec)`,
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
      console.log(`Synced ${insertedCount} works rows for dump ${dumpDate}`);

      console.log(`Restoring indexed/logged state for openlibrary_work_search`);
      await sql`SELECT openlibrary_work_search_set_indexed(true)`;
      console.log(`Restored indexed/logged state for openlibrary_work_search`);

      return { dumpDate, insertedCount };
    } finally {
      await sql.end();
    }
  },
});
