import { schemaTask, tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { BQClient } from "./bq";
import { streamTracker } from "./utils";
import prettyMilliseconds from "pretty-ms";
import { ResourceMonitor } from "../resourceMonitor";
import formatNumber from "format-number";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { S3Client } from "./s3";
import { Elastic } from "../elastic";

const format = formatNumber({ round: 0 });

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
  let started = false;

  return new Readable({
    objectMode: true,
    async read() {
      if (started) {
        return;
      }
      started = true;

      try {
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
          if (finalLine.length > 0) {
            this.push(JSON.parse(finalLine));
          }
        }

        this.push(null);
      } catch (error) {
        this.destroy(error as Error);
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
    const bq = new BQClient();
    const elastic = new Elastic();
    const s3 = new S3Client("etl");
    let indexedCount = 0;
    const exportPrefix = `exports/works/`;

    try {
      await s3.clearDirectory(exportPrefix);
      console.log(`Exporting BigQuery works_search table`);
      const job = await bq.createQueryJob(`
        EXPORT DATA OPTIONS (
          uri = 'gs://${s3.bucket}/${exportPrefix}/*.json.gz',
          format = 'JSON',
          compression = 'GZIP',
          overwrite = true
        ) AS
        SELECT
          *
        FROM \`${bq.projectId}.openlibrary.works_search\`
      `);
      await job.promise();
      console.log(`Exported BigQuery works_search table`);

      console.log(`Clearing Elasticsearch work search index`);
      await elastic.clearWorkSearchIndex();
      console.log(`Cleared Elasticsearch work search index`);

      const jsonStream = await streamJsonRows(s3, exportPrefix);
      const trackedRows = jsonStream.pipe(
        streamTracker(100_000, (n, t) => {
          console.log(
            `Completed ${format(n)} rows in ${prettyMilliseconds(t)} (${format((n / t) * 1000)} rows/sec)`,
          );
        }),
      );

      const stats = await elastic.bulkIndexWorkSearchDocuments(trackedRows);
      indexedCount = stats.successful;
      console.log(`Indexed ${indexedCount} works rows for dump ${dumpDate}`);

      return { dumpDate, indexedCount };
    } finally {
      try {
        console.log(
          `Deleting exported work-search files from s3://${s3.bucket}/${exportPrefix}/`,
        );
        await s3.clearDirectory(exportPrefix);
      } catch (error) {
        console.error(
          `Failed to delete exported work-search files from s3://${s3.bucket}/${exportPrefix}/`,
          error,
        );
      }
    }
  },
});
