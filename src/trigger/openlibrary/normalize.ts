import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { S3Client } from "@/trigger/openlibrary/s3";
import {
  clearDirectory,
  getFileNames,
  setupDuckDB,
  getParquetRowCount,
} from "@/trigger/openlibrary/utils";
import { csvToParquetMetadataSchema } from "@/trigger/openlibrary/csv-to-parquet";
import { openLibraryNormalizeWorkerTask } from "@/trigger/openlibrary/normalize-worker";
import { batchTriggerAndWait } from "@/trigger/utils";

export const aggregateEditionsMetadataValidator = z.object({
  status: z.enum(["success", "in-progress", "failed"]),
  rows: z.number().int(),
  dumpDate: z.string(),
  normalizedAt: z.iso.datetime(),
});

export const openLibraryNormalizeTask = schemaTask({
  id: "openlibrary-normalize",
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  schema: z.object({
    source: z.string(),
    target: z.string(),
    dumpDate: z.string(),
    queryToUse: z.enum(["works", "editions", "authors"]),
    rowsPerBatch: z.number().int().positive(),
    machineSize: z
      .enum([
        "micro",
        "small-1x",
        "small-2x",
        "medium-1x",
        "medium-2x",
        "large-1x",
        "large-2x",
      ])
      .default("small-2x"),
  }),
  run: async (
    { source, target, dumpDate, queryToUse, rowsPerBatch, machineSize },
    { ctx },
  ) => {
    const s3 = new S3Client();
    if (!(await checkIfShouldRun(source, target, s3, ctx))) {
      return;
    }

    clearDirectory("/tmp");
    const [sourceParquetKey, sourceMetadataKey] = getFileNames(source);
    const [targetParquetKey, targetMetadataKey] = getFileNames(target);
    const [targetParquetGlob] = getFileNames(`${target}-*`);
    await s3.safeDeleteObject([targetParquetKey, targetMetadataKey]);
    await s3.deleteObjectsByWildcard(targetParquetGlob);
    await s3.setMetadata(
      targetMetadataKey,
      aggregateEditionsMetadataValidator,
      {
        status: "in-progress",
        rows: 0,
        dumpDate,
        normalizedAt: new Date().toISOString(),
      },
    );
    await using db = await setupDuckDB(ctx);
    try {
      const inputRows = await getParquetRowCount(sourceParquetKey, db);
      const batches = getNormalizeBatches(target, inputRows, rowsPerBatch);
      console.log(
        `Spawning ${batches.length} normalization batches for ${inputRows} rows from ${sourceParquetKey}`,
      );
      if (batches.length > 0) {
        await batchTriggerAndWait(
          batches.map((batch) => ({
            task: openLibraryNormalizeWorkerTask,
            payload: {
              source: sourceParquetKey,
              target: batch.targetParquetKey,
              limit: batch.limit,
              offset: batch.offset,
              queryToUse,
            },
            options: {
              machine: machineSize,
            },
          })),
        );
      }

      const rows = await getNormalizeOutputRowCount(target, db);
      await s3.setMetadata(
        targetMetadataKey,
        aggregateEditionsMetadataValidator,
        {
          status: "success",
          rows,
          dumpDate,
          normalizedAt: new Date().toISOString(),
        },
      );
      console.log(`Normalized ${rows} rows from ${source} to ${target}`);
    } catch (e) {
      await s3.setMetadata(
        targetMetadataKey,
        aggregateEditionsMetadataValidator,
        {
          rows: 0,
          dumpDate,
          normalizedAt: new Date().toISOString(),
          status: "failed",
        },
      );
      console.log(`Failed to normalize ${source} to ${target}: ${e}`);
      throw e;
    }
  },
});

function getNormalizeBatches(
  target: string,
  rows: number,
  rowsPerBatch: number,
) {
  const batchCount = Math.ceil(rows / rowsPerBatch);
  return Array.from({ length: batchCount }, (_, index) => {
    const pieceNumber = index + 1;
    const offset = index * rowsPerBatch;
    const limit = Math.min(rowsPerBatch, rows - offset);
    const [targetParquetKey] = getFileNames(`${target}-${pieceNumber}`);
    return {
      pieceNumber,
      limit,
      offset,
      targetParquetKey,
    };
  });
}

async function getNormalizeOutputRowCount(
  target: string,
  db?: Awaited<ReturnType<typeof setupDuckDB>>,
  ctx?: Parameters<typeof setupDuckDB>[0],
) {
  const [targetParquetGlob] = getFileNames(`${target}-*`);
  return getParquetRowCount(targetParquetGlob, db, ctx);
}

async function checkIfShouldRun(
  source: string,
  target: string,
  s3: S3Client,
  ctx: Parameters<typeof setupDuckDB>[0],
) {
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
  const sourceRowCount = await getParquetRowCount(
    sourceParquetKey,
    undefined,
    ctx,
  );
  if (sourceRowCount !== sourceMetadata.data.rows) {
    throw new Error(
      `Source row count ${sourceRowCount} does not match metadata row count ${sourceMetadata.data.rows}`,
    );
  }

  // Source parquet and metadata check out

  const [, targetMetadataKey] = getFileNames(target);
  const targetMetadata = await s3.getMetadata(
    targetMetadataKey,
    aggregateEditionsMetadataValidator,
  );
  if (!targetMetadata.success) {
    console.log(
      `Target ${targetMetadataKey} file not found or parse error, running step`,
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
  if (targetMetadata.data.normalizedAt <= sourceMetadata.data.exportedAt) {
    console.log(
      `Target normalizedAt ${targetMetadata.data.normalizedAt} is before source exportedAt ${sourceMetadata.data.exportedAt}, running step`,
    );
    return true;
  }
  const targetRowCount = await getNormalizeOutputRowCount(
    target,
    undefined,
    ctx,
  );
  if (targetRowCount !== targetMetadata.data.rows) {
    console.log(
      `Target row count ${targetRowCount} does not match metadata row count ${targetMetadata.data.rows}, running step`,
    );
    return true;
  }

  console.log(
    `Target file and metadata appear to be up to date. Skipping step.`,
  );
  return false;
}
