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

export const openLibrarySyncAuthorSearchTask = schemaTask({
  id: "openlibrary-sync-author-search",
  schema: z.object({
    dumpDate: z.string(),
  }),
  machine: "micro",
  maxDuration: 43200,
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
    let insertedCount = 0;

    try {
      await sql`TRUNCATE TABLE openlibrary_work_author_search`;
      await sql`SELECT openlibrary_work_author_search_set_indexed(false)`;

      const bqStream = bq.queryStream(
        `
        SELECT
          olid,
          canonical_score,
          author_search_text
        FROM \`${bq.projectId}.openlibrary.works_author_search\`
      `,
      );
      const pgStream = await sql`
        COPY openlibrary_work_author_search (olid, canonical_score, author_search_text)
        FROM STDIN
        WITH (FORMAT csv, NULL '\\N');
      `.writable();

      await pipeline(
        bqStream,
        streamTracker(100_000, (n, t) => {
          console.log(
            `Completed ${format(n)} rows in ${prettyMilliseconds(t)} (${format((n / t) * 1000)} rows/sec)`,
          );
        }),
        toPostgresCsvRow(["olid", "canonical_score", "author_search_text"]),
        pgStream,
      );
      console.log(
        `Synced ${insertedCount} author search rows for dump ${dumpDate}`,
      );

      console.log(
        `Restoring indexed/logged state for openlibrary_work_author_search`,
      );
      await sql`SELECT openlibrary_work_author_search_set_indexed(true)`;
      console.log(
        `Restored indexed/logged state for openlibrary_work_author_search`,
      );

      return { dumpDate, insertedCount };
    } finally {
      await sql.end();
    }
  },
});
