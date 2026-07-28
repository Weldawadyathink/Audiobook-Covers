import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import formatNumber from "format-number";
import prettyMilliseconds from "pretty-ms";
import { duckdbInsertSql } from "./load-sql";
import { gcsUris, openDuckDbSession, PG_ALIAS, uriListLiteral } from "./duckdb";
import { env } from "@/env.node";

const format = formatNumber({ round: 0 });

/**
 * Loads one wave's worth of Parquet shards straight into a Postgres table.
 *
 * Each run receives a *list* of object keys and reads them as a single
 * `read_parquet([...])`, rather than one file per call. BigQuery shards its
 * export into a large number of very small files, and DuckDB parallelises the
 * reads within one statement — one file per statement would spend most of its
 * time on per-request HTTP overhead.
 *
 * The target is always a table nothing else is reading concurrently (the delta
 * staging table, or the not-yet-swapped-in `openlibrary_work_new`), which is
 * what makes a plain `INSERT` from N parallel runs safe.
 */
export const openLibraryLoadParquetTask = schemaTask({
  id: "openlibrary-load-parquet",
  schema: z.object({
    /** GCS object keys for this wave, already listed by the orchestrator. */
    keys: z.array(z.string()).min(1),
    /** Postgres schema the target table lives in (`prod` or `dev`). */
    schemaName: z.string(),
    targetTable: z.string(),
    /** Delta exports carry `change_type`; full exports do not. */
    includeChangeType: z.boolean(),
  }),
  machine: "small-1x",
  maxDuration: 3 * 60 * 60,
  retry: {
    maxAttempts: 1,
  },
  run: async ({ keys, schemaName, targetTable, includeChangeType }) => {
    const uris = gcsUris(env.ETL_S3_BUCKET, keys);
    const insertSql = duckdbInsertSql({
      pgAlias: PG_ALIAS,
      schemaName,
      targetTable,
      includeChangeType,
      uriListLiteral: uriListLiteral(uris),
    });
    const startedAt = performance.now();

    console.log(
      `Loading ${keys.length} Parquet shards into ${schemaName}.${targetTable}`,
    );

    const { connection, close } = await openDuckDbSession();
    try {
      const result = await connection.run(insertSql);

      const elapsed = performance.now() - startedAt;
      const rowsInserted = result.rowsChanged;
      console.log(
        `Loaded ${format(rowsInserted)} rows in ${prettyMilliseconds(elapsed)} ` +
          `(${format((rowsInserted / elapsed) * 1000)} rows/sec)`,
      );

      return { keyCount: keys.length, rowsInserted };
    } finally {
      close();
    }
  },
});
