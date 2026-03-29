import { task } from "@trigger.dev/sdk/v3";
import {
  makeS3Client,
  getStoredMetadata,
  worksParquetFile,
  enrichedMetadataKey,
} from "./utils";
import { openLibraryEnrichWorkerTask } from "./enrich-worker";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import { env } from "@/env";
import { batchTriggerAndWait } from "../utils";
import { ResourceMonitor } from "../resourceMonitor";
import { tasks } from "@trigger.dev/sdk/v3";

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  resourceMonitor.startMonitoring(10_000);
  await next();
  resourceMonitor.stopMonitoring();
});

const CHUNK_SIZE = 100_000;

export const openLibraryEnrichTask = task({
  id: "openlibrary-enrich",
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  run: async ({ dumpDate }: { dumpDate: string }) => {
    const s3 = makeS3Client();

    const stored = await getStoredMetadata(s3, enrichedMetadataKey);
    if (stored !== null && stored.dump_date === dumpDate) {
      console.log(`Enriched works already complete for ${dumpDate}. Skipping.`);
      return { row_count: stored.row_count ?? 0 };
    }

    const tmpDir = "/tmp/enrich-coordinator";
    fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
    fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

    const db = await DuckDBInstance.create(`${tmpDir}/duck.db`);
    const con = await db.connect();

    try {
      await con.run(`SET home_directory='${tmpDir}/home'`);
      await con.run(`SET temp_directory='${tmpDir}/temp'`);
      await con.run("SET memory_limit = '200MB'");
      await con.run("SET threads = 1");

      await con.run("INSTALL httpfs");
      await con.run("LOAD httpfs");

      await con.run(`
        CREATE OR REPLACE SECRET secret (
          type s3,
          endpoint '${env.S3_ENDPOINT.replace("https://", "")}',
          region '${env.S3_REGION}',
          key_id '${env.S3_ACCESS_KEY_ID}',
          secret '${env.S3_SECRET_ACCESS_KEY}'
        );
      `);

      const countResult = await con.run(
        `SELECT count(*) FROM read_parquet('${worksParquetFile}')`,
      );
      const countRows = await countResult.getRows();
      const totalRows = Number(countRows[0][0]);
      const numChunks = Math.ceil(totalRows / CHUNK_SIZE);
      console.log(
        `Total works rows: ${totalRows.toLocaleString()}, dispatching ${numChunks} worker tasks`,
      );

      await batchTriggerAndWait(
        Array.from({ length: numChunks }, (_, i) => ({
          task: openLibraryEnrichWorkerTask,
          payload: { dumpDate, chunkIndex: i, totalChunks: numChunks, chunkSize: CHUNK_SIZE },
        })),
      );

      return { numChunks };
    } finally {
      con.closeSync();
      db.closeSync();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
});
