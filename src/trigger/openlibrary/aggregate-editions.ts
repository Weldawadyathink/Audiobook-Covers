import { schemaTask, tasks } from "@trigger.dev/sdk/v3";
import { ResourceMonitor } from "@/trigger/resourceMonitor";
import { env } from "@/env";
import { z } from "zod/v4";
import { S3Client } from "@/trigger/openlibrary/s3";
import {
  clearDirectory,
  getFileNames,
  setupDuckDB,
  getParquetRowCount,
} from "@/trigger/openlibrary/utils";
import * as fs from "fs";
import { DuckDBInstance } from "@duckdb/node-api";
import { csvToParquetMetadataSchema } from "@/trigger/openlibrary/csv-to-parquet";

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  if (process.env.RESOURCE_MONITOR_ENABLED === "1") {
    resourceMonitor.startMonitoring(10_000);
  }
  await next();
  resourceMonitor.stopMonitoring();
});

export const openLibraryCsvToParquetTask = schemaTask({
  id: "openlibrary-csv-to-parquet",
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  schema: z.object({
    source: z.string(),
    target: z.string(),
    dumpDate: z.string(),
  }),
  run: async ({ source, target, dumpDate }) => {
    const s3 = new S3Client();
    if (!(await checkIfShouldRun(source, target, s3))) {
      return;
    }

    const db = await setupDuckDB();
  },
});

async function checkIfShouldRun(source: string, target: string, s3: S3Client) {
  // Checks if initial conditions allow this workflow step to run
  // Source should be marked as complete, and count of rows should match metadata
  //   Any incorrect value for source will throw an error
  // Target should be the following:
  // - not present (first run, returns true)
  // - present and count of rows matches metadata (up-to-date, returns false)
  // - count does not match metadata (out-of-date, returns true)
  // - dumpDate of target does not match dumpDate of source (out-of-date, returns true)
  const [sourceParquetKey, sourceMetadataKey] = getFileNames(source);
  const sourceMetadata = await s3.getMetadata(
    sourceMetadataKey,
    csvToParquetMetadataSchema,
  );
  if (!sourceMetadata.success) {
    throw new Error(
      `Source ${sourceMetadataKey} file parse error, or file not found`,
    );
  }
  if (sourceMetadata.data.status !== "success") {
    throw new Error(
      `Source metadata is not complete: ${sourceMetadata.data.status}`,
    );
  }
  const sourceRowCount = await getParquetRowCount(sourceParquetKey);
  if (sourceRowCount !== sourceMetadata.data.rows) {
    throw new Error(
      `Source row count ${sourceRowCount} does not match metadata row count ${sourceMetadata.data.rows}`,
    );
  }

  // Source parquet and metadata check out

  const [targetParquetKey, targetMetadataKey] = getFileNames(target);
  const targetMetadata = await s3.getMetadata(
    targetMetadataKey,
    csvToParquetMetadataSchema,
  );
  if (!targetMetadata.success) {
    console.log(
      `Target ${targetMetadataKey} file not found or parse error, running step`,
    );
    return true;
  }
  const targetRowCount = await getParquetRowCount(targetParquetKey);
  if (targetRowCount !== targetMetadata.data.rows) {
    console.log(
      `Target row count ${targetRowCount} does not match metadata row count ${targetMetadata.data.rows}, running step`,
    );
    return true;
  }
  if (targetMetadata.data.status !== "success") {
    console.log(
      `Target metadata is not complete: ${targetMetadata.data.status}, running step`,
    );
    return true;
  }
  if (targetMetadata.data.dumpDate !== sourceMetadata.data.dumpDate) {
    console.log(
      `Target dumpDate ${targetMetadata.data.dumpDate} does not match source dumpDate ${sourceMetadata.data.dumpDate}, running step`,
    );
    return true;
  }
  console.log(
    `Target file and metadata appear to be up to date. Skipping step.`,
  );
  return true;
}
