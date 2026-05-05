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
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { S3Client } from "./s3";

const format = formatNumber({ round: 0 });

const columns = [
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
];

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({
    ctx,
  });
  resourceMonitor.startMonitoring(10_000);
  await next();
  resourceMonitor.stopMonitoring();
});

async function streamJsonRows(s3: S3Client, prefix: string) {
  const objects = await s3.listObjects(prefix);
  return new Readable({
    objectMode: true,
    async read() {
      for (const object of objects) {
        const source = await s3.getObjectStream(object.key);
        const stream = source.pipe(createGunzip()).setEncoding("utf8");
        let buffer = "";

        for await (const chunk of stream) {
          buffer += chunk;

          for (;;) {
            const newlineIndex = buffer.indexOf("\n");
            if (newlineIndex === -1) {
              break;
            }

            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            this.push(JSON.parse(line));
          }
        }
        const finalLine = buffer.trim();
        this.push(JSON.parse(finalLine));
      }
    },
  });
}

export const openLibrarySyncWorkSearchTask = schemaTask({
  id: "openlibrary-sync-work-search",
  schema: z.object({
    dumpDate: z.string(),
  }),
  machine: "micro",
  maxDuration: 12 * 60 * 60,
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
    const s3 = new S3Client("etl");
    let insertedCount = 0;
    let searchIndexDisabled = false;
    const exportPrefix = `/exports/works/`;

    try {
      await s3.clearDirectory(`s3://${s3.bucket}/${exportPrefix}`);
      console.log(`Exporting BigQuery works_search table`);
      const job = await bq.createQueryJob(`
        EXPORT DATA OPTIONS (
          uri = 'gs://${s3.bucket}/${exportPrefix}/*.json.gz',
          format = 'NEWLINE_DELIMITED_JSON',
          compression = 'GZIP',
          overwrite = true
        ) AS
        SELECT
          ${columns.join(",")}
        FROM \`${bq.projectId}.openlibrary.works_search\`
      `);
      await job.promise();
      console.log(`Exported BigQuery works_search table`);

      console.log(`Truncating openlibrary_work_search table`);
      await sql`TRUNCATE TABLE openlibrary_work_search`;
      await sql`SELECT openlibrary_work_search_set_indexed(false)`;
      searchIndexDisabled = true;

      const pgStream = await sql`
        COPY openlibrary_work_search (
          ${sql.unsafe(columns.join(","))}
        )
        FROM STDIN
        WITH (FORMAT csv, NULL '\\N');
      `.writable();

      const jsonStream = await streamJsonRows(
        s3,
        `${s3.bucket}/${exportPrefix}`,
      );
      await pipeline(
        jsonStream,
        streamTracker(100_000, (n, t) => {
          insertedCount = n;
          console.log(
            `Completed ${format(n)} rows in ${prettyMilliseconds(t)} (${format((n / t) * 1000)} rows/sec)`,
          );
        }),
        toPostgresCsvRow(columns),
        pgStream,
      );
      console.log(`Synced ${insertedCount} works rows for dump ${dumpDate}`);

      console.log(`Restoring indexed/logged state for openlibrary_work_search`);
      await sql`SELECT openlibrary_work_search_set_indexed(true)`;
      searchIndexDisabled = false;
      console.log(`Restored indexed/logged state for openlibrary_work_search`);

      return { dumpDate, insertedCount };
    } finally {
      if (searchIndexDisabled) {
        try {
          console.log(
            `Restoring indexed/logged state for openlibrary_work_search after failure`,
          );
          await sql`SELECT openlibrary_work_search_set_indexed(true)`;
        } catch (error) {
          console.error(
            `Failed to restore indexed/logged state for openlibrary_work_search`,
            error,
          );
        }
      }

      try {
        console.log(
          `Deleting exported work-search files from s3://${s3.bucket}/${exportPrefix}/`,
        );
        await s3.clearDirectory(`s3://${s3.bucket}/${exportPrefix}`);
      } catch (error) {
        console.error(
          `Failed to delete exported work-search files from s3://${s3.bucket}/${exportPrefix}/`,
          error,
        );
      }

      await sql.end();
    }
  },
});
