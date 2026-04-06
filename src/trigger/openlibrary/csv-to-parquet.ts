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

tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  if (process.env.RESOURCE_MONITOR_ENABLED === "1") {
    resourceMonitor.startMonitoring(10_000);
  }
  await next();
  resourceMonitor.stopMonitoring();
});

export const csvToParquetMetadataSchema = z.object({
  dumpDate: z.string(),
  source: z.url(),
  exportedAt: z.iso.datetime(),
  status: z.enum(["success", "in-progress", "failed"]),
  rows: z.number().int(),
});

export type CsvToParquetMetadataType = z.infer<
  typeof csvToParquetMetadataSchema
>;

export const openLibraryCsvToParquetTask = schemaTask({
  id: "openlibrary-csv-to-parquet",
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  schema: z.object({
    source: z.url(),
    target: z.string(),
    dumpDate: z.string(),
  }),
  run: async ({ source, target, dumpDate }) => {
    const [targetParquet, targetMetadata] = getFileNames(target);
    const s3 = new S3Client();

    const existingMetadata = await s3.getMetadata(
      targetMetadata,
      csvToParquetMetadataSchema,
    );
    if (existingMetadata.success) {
      if (
        existingMetadata.data.status === "success" &&
        existingMetadata.data.dumpDate === dumpDate
      ) {
        console.log(
          `Skipping ${target} as it was already processed for ${dumpDate} on ${existingMetadata.data.exportedAt}`,
        );
        return;
      }
    }

    await s3.safeDeleteObject([targetParquet, targetMetadata]);

    await s3.setMetadata(targetMetadata, csvToParquetMetadataSchema, {
      rows: 0,
      dumpDate,
      source,
      exportedAt: new Date().toISOString(),
      status: "in-progress",
    });

    clearDirectory("/tmp");

    try {
      await using db = await setupDuckDB();
      console.log(`Copying ${source} to ${targetParquet}`);
      await db.run(`
        COPY (SELECT * FROM read_csv(
          '${source}',
          sep           = '\t',
          header        = false,
          quote         = '',
          columns       = {type: 'VARCHAR', key: 'VARCHAR', revision: 'VARCHAR',
                           last_modified: 'VARCHAR', data: 'VARCHAR'},
          ignore_errors = true
        ))
        TO 's3://${env.S3_BUCKET}/${targetParquet}'
        WITH (FORMAT PARQUET, COMPRESSION ZSTD);
      `);

      const rowCount = await getParquetRowCount(targetParquet, db);

      console.log(
        `Copied ${rowCount} rows from ${source} to ${targetParquet}. Cleaning up.`,
      );

      await s3.setMetadata(targetMetadata, csvToParquetMetadataSchema, {
        rows: rowCount,
        dumpDate,
        source,
        exportedAt: new Date().toISOString(),
        status: "success",
      });

      console.log(`Created metadata for ${targetParquet}.`);
    } catch (error) {
      console.log(`Failed to copy ${source} to ${targetParquet}.`);
      await s3.setMetadata(targetMetadata, csvToParquetMetadataSchema, {
        rows: 0,
        dumpDate,
        source,
        exportedAt: new Date().toISOString(),
        status: "failed",
      });
      throw error;
    }
  },
});
