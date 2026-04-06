import { schemaTask, tasks } from "@trigger.dev/sdk/v3";
import { ResourceMonitor } from "@/trigger/resourceMonitor";
import { env } from "@/env";
import { z } from "zod/v4";
import { s3Client } from "@/trigger/openlibrary/s3";
import * as fs from "fs";
import { DuckDBInstance } from "@duckdb/node-api";
import * as path from "path";

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
    const targetParquet = `${target}.parquet`;
    const targetMetadata = `${target}.metadata`;
    const s3 = new s3Client();

    const existingMetadata = csvToParquetMetadataSchema.safeParse(
      await s3.safeGetObject(targetMetadata),
    );
    if (
      existingMetadata.success &&
      existingMetadata.data.status !== "success" &&
      existingMetadata.data.dumpDate === dumpDate
    ) {
      console.log(
        `Skipping ${target} as it was already processed for ${dumpDate} on ${existingMetadata.data.exportedAt}`,
      );
      return;
    }

    await s3.safeDeleteObject([targetParquet, targetMetadata]);

    await s3.createJson(
      targetMetadata,
      csvToParquetMetadataSchema.parse({
        rows: 0,
        dumpDate,
        source,
        exportedAt: new Date().toISOString(),
        status: "in-progress",
      } as CsvToParquetMetadataType),
    );

    const db = await DuckDBInstance.create();
    const con = await db.connect();

    try {
      const tmpDir = "/tmp";
      // Clear directory without removing the directory itself
      try {
        for (const entry of fs.readdirSync(tmpDir)) {
          fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
        }
      } catch (error) {
        // Possible permissions error, ignore
      }
      fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
      fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

      await con.run(`SET home_directory='/tmp/home'`);
      await con.run(`SET temp_directory='/tmp/temp'`);
      await con.run("SET max_temp_directory_size = '9GB'");

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

      console.log(`Copying ${source} to ${targetParquet}`);
      await con.run(`
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

      const result = await con.run(
        `SELECT count(*) FROM read_parquet('s3://${env.S3_BUCKET}/${targetParquet}')`,
      );
      const rows = await result.getRows();
      const rowCount = Number(rows[0][0]);

      console.log(
        `Copied ${rowCount} rows from ${source} to ${targetParquet}. Cleaning up.`,
      );

      await s3.safeDeleteObject(targetParquet);
      await s3.createJson(
        targetMetadata,
        csvToParquetMetadataSchema.parse({
          rows: rowCount,
          dumpDate,
          source,
          exportedAt: new Date().toISOString(),
          status: "success",
        } as CsvToParquetMetadataType),
      );
      console.log(`Created metadata for ${targetParquet}.`);
    } catch (error) {
      console.log(`Failed to copy ${source} to ${targetParquet}.`);
      con.closeSync();
      await s3.createJson(
        targetMetadata,
        csvToParquetMetadataSchema.parse({
          rows: 0,
          dumpDate,
          source,
          exportedAt: new Date().toISOString(),
          status: "failed",
        } as CsvToParquetMetadataType),
      );
      throw error;
    }
  },
});
