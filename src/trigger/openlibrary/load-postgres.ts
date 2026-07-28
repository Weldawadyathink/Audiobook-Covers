import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import formatNumber from "format-number";
import prettyMilliseconds from "pretty-ms";
import { createPostgresWriteDb } from "@/db.node";
import { schemaName } from "@/db/schema";
import { env } from "@/env.node";
import { S3Client } from "./s3";
import {
  DELTA_STAGE_TABLE,
  KEEP_TABLE,
  NEW_TABLE,
  TARGET_TABLE,
  deleteChunkSql,
  deltaStageDdl,
  deltaStageIndexDdl,
  dropOldTableSql,
  keepTableDdl,
  keepTableInsertSql,
  newTableDdl,
  qualify,
  rebuildIndexCommands,
  swapStatements,
  upsertChunkSql,
} from "./load-sql";
import { openLibraryLoadParquetTask } from "./load-parquet";
import { batchTriggerAndWait } from "../utils";
import {
  assertTargetSchema,
  renewEtlLease,
  setCatalogueState,
} from "./etl-state";
import {
  formatIndexProgress,
  readIndexProgress,
  runDetachedDdl,
} from "./pg-cron";

const format = formatNumber({ round: 0 });

/**
 * Shards handed to a single loader run, read as one `read_parquet([...])`.
 *
 * BigQuery emits a large number of very small Parquet files. Batching amortises
 * the fixed cost of a run — container start, extension load, the Postgres
 * `ATTACH` and its TLS handshake — across many files instead of paying it per
 * file, and it makes the whole wave a single `INSERT` rather than N of them.
 *
 * Not, on these machine presets, about read parallelism: DuckDB runs with
 * `threads = 1` on a sub-2 vCPU container (see `resourceSettings`), so the reads
 * are pipelined rather than genuinely concurrent.
 */
const FILES_PER_LOADER = 40;

/**
 * Loaders in flight at once. The bottleneck is PlanetScale, not the workers, so
 * this is about finding the point where more writers stop making it faster —
 * see the open question in docs/openlibrary-etl.md.
 *
 * It also bounds how long this task is blocked in `batchTriggerAndWait`, which
 * is the longest stretch during which the ETL lease cannot be renewed.
 */
const LOADERS_PER_WAVE = 6;

/** Rows per committed statement in the delta merge. */
const MERGE_CHUNK_SIZE = 25_000;

type Db = ReturnType<typeof createPostgresWriteDb>;
type Sql = Db["sql"];

type ChunkResult = {
  next_cursor: string | null;
  chunk_size: number;
  applied_count: number;
};

/**
 * Fans the export out across loader runs, in waves.
 *
 * `renewLease` runs between waves. This task is suspended while a wave is in
 * flight and cannot renew anything then, so wave duration is what the lease TTL
 * ultimately has to cover.
 */
async function loadShards({
  keys,
  schemaName,
  targetTable,
  includeChangeType,
  renewLease,
}: {
  keys: string[];
  schemaName: string;
  targetTable: string;
  includeChangeType: boolean;
  renewLease: () => Promise<void>;
}) {
  const batches: string[][] = [];
  for (let index = 0; index < keys.length; index += FILES_PER_LOADER) {
    batches.push(keys.slice(index, index + FILES_PER_LOADER));
  }

  const waveCount = Math.ceil(batches.length / LOADERS_PER_WAVE);
  console.log(
    `Loading ${keys.length} shards into ${schemaName}.${targetTable} as ` +
      `${batches.length} loader runs across ${waveCount} waves`,
  );

  let rowsInserted = 0;
  for (let index = 0; index < batches.length; index += LOADERS_PER_WAVE) {
    const wave = batches.slice(index, index + LOADERS_PER_WAVE);
    const results = await batchTriggerAndWait(
      wave.map((waveKeys) => ({
        task: openLibraryLoadParquetTask,
        payload: {
          keys: waveKeys,
          schemaName,
          targetTable,
          includeChangeType,
        },
      })),
    );

    rowsInserted += results.reduce(
      (total, result) => total + result.rowsInserted,
      0,
    );
    await renewLease();
    console.log(
      `Wave ${index / LOADERS_PER_WAVE + 1}/${waveCount} done — ` +
        `${format(rowsInserted)} rows loaded so far`,
    );
  }

  return rowsInserted;
}

/**
 * Drives one of the chunked merge statements to exhaustion.
 *
 * Each iteration is a separate statement and therefore its own transaction.
 * Wrapping the whole merge in one transaction would pin the xmin horizon for
 * hours and block autovacuum across the entire database — which is how the
 * previous loader managed to degrade everything else while it ran.
 */
async function runChunked({
  sql,
  statement,
  label,
}: {
  sql: Sql;
  statement: string;
  label: string;
}) {
  let cursor = "";
  let applied = 0;
  let scanned = 0;

  for (;;) {
    const [row] = await sql.unsafe<ChunkResult[]>(statement, [
      cursor,
      MERGE_CHUNK_SIZE,
    ]);

    if (!row || row.chunk_size === 0 || row.next_cursor === null) break;

    cursor = row.next_cursor;
    applied += row.applied_count;
    scanned += row.chunk_size;
    console.log(
      `${label}: applied ${format(applied)} of ${format(scanned)} staged rows`,
    );
  }

  return { applied, scanned };
}

/**
 * Path A — the normal month. Land the delta in a staging table, then merge it
 * into the live table in committed chunks.
 */
async function loadDelta({
  sql,
  schemaName,
  keys,
  renewLease,
}: {
  sql: Sql;
  schemaName: string;
  keys: string[];
  renewLease: () => Promise<void>;
}) {
  const stage = qualify(schemaName, DELTA_STAGE_TABLE);

  await sql.unsafe(`DROP TABLE IF EXISTS ${stage}`);
  await sql.unsafe(deltaStageDdl(schemaName));

  const rowsStaged = await loadShards({
    keys,
    schemaName,
    targetTable: DELTA_STAGE_TABLE,
    includeChangeType: true,
    renewLease,
  });

  // Built inline rather than via pg_cron: the delta-ratio guard bounds this
  // table to a fraction of the catalogue, so it is minutes, not hours.
  await sql.unsafe(deltaStageIndexDdl(schemaName));
  await sql.unsafe(`ANALYZE ${stage}`);
  await renewLease();

  // Deletes first, so the upserts run against a smaller table.
  const deletes = await runChunked({
    sql,
    statement: deleteChunkSql(schemaName),
    label: "Deletes",
  });
  await renewLease();

  const upserts = await runChunked({
    sql,
    statement: upsertChunkSql(schemaName),
    label: "Upserts",
  });
  await renewLease();

  await sql.unsafe(`DROP TABLE IF EXISTS ${stage}`);

  // After a large merge the planner is working from stale statistics, which is
  // an easy way to make search feel broken after a "successful" load.
  await sql.unsafe(`ANALYZE ${qualify(schemaName, TARGET_TABLE)}`);

  return {
    rowsStaged,
    deletedCount: deletes.applied,
    upsertedCount: upserts.applied,
  };
}

/**
 * Runs one index build detached via pg_cron, sleeping between progress checks.
 *
 * There is no completion deadline — see {@link runDetachedDdl}. Completion is
 * decided by the object actually existing, not by what pg_cron's run log claims.
 */
async function runIndexDdl({
  jobName,
  label,
  command,
  existsSql,
  schemaName,
  renewLease,
}: {
  jobName: string;
  label: string;
  command: string;
  existsSql: string;
  schemaName: string;
  renewLease: () => Promise<void>;
}) {
  console.log(`Building ${label} via pg_cron`);
  const startedAt = performance.now();

  const outcome = await runDetachedDdl({
    jobName,
    command,
    searchPath: schemaName,
    hasCompleted: () =>
      // Each check opens a connection, reads, and closes it again. Holding one
      // open across the sleep is exactly the cost this design avoids.
      withShortLivedDb(async ({ sql }) => {
        const [row] = await sql.unsafe<{ present: boolean }[]>(existsSql);
        return row?.present === true;
      }),
    hasStarted: () =>
      withShortLivedDb(
        async ({ sqlTools }) =>
          (await readIndexProgress({ sqlTools })) !== null,
      ),
    onWake: async () => {
      await renewLease();
      await withShortLivedDb(async ({ sqlTools }) => {
        const progress = await readIndexProgress({ sqlTools });
        console.log(`${label}: ${formatIndexProgress(progress)}`);
      });
    },
  });

  if (outcome.state === "failed") {
    throw new Error(
      `Failed to build ${label}: ${outcome.message ?? "no message from pg_cron"}`,
    );
  }

  console.log(
    `Built ${label} in ${prettyMilliseconds(performance.now() - startedAt)}`,
  );
}

async function withShortLivedDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = createPostgresWriteDb({
    application_name: "openlibrary-etl-poll",
  });
  try {
    return await fn(db);
  } finally {
    await db.sql.end();
  }
}

/**
 * Path B — build and swap, at 1x peak storage.
 *
 * The naive version needs room for two full copies. Instead the *small* table
 * swaps in first: everything the website can reach is a row whose `olid` appears
 * in `image`, so a table holding only those is a complete catalogue as far as
 * the site is concerned. Dropping the old full table then returns its storage
 * immediately — `DELETE` would not, since dead tuples sit in the heap until a
 * `VACUUM FULL` that needs exactly the headroom being avoided.
 *
 * The window between the two swaps is the only time the catalogue is
 * incomplete, and `catalogue_state` blocks the agentic workflow for its
 * duration.
 */
async function loadFull({
  sql,
  db,
  schemaName,
  keys,
  leaseRunId,
  renewLease,
}: {
  sql: Sql;
  db: Db;
  schemaName: string;
  keys: string[];
  leaseRunId: string;
  renewLease: () => Promise<void>;
}) {
  const keep = qualify(schemaName, KEEP_TABLE);
  const next = qualify(schemaName, NEW_TABLE);

  await sql.unsafe(`DROP TABLE IF EXISTS ${keep}`);
  await sql.unsafe(`DROP TABLE IF EXISTS ${next}`);

  console.log(`Building ${KEEP_TABLE} from OLIDs referenced by image`);
  await sql.unsafe(keepTableDdl(schemaName));
  const keepResult = await sql.unsafe(keepTableInsertSql(schemaName));
  const keptRows = keepResult.count ?? 0;
  console.log(`Kept ${format(keptRows)} referenced works`);

  // Created while the pristine table is still in place, so the LIKE is taken
  // from it rather than from the keep table's copy of it.
  await sql.unsafe(newTableDdl(schemaName));

  // Flagged before the swap, not after. Erring towards "reduced" costs a few
  // seconds of unnecessarily blocked search; erring the other way lets the
  // agentic workflow write wrong OLIDs into `image`.
  await setCatalogueState(db, { runId: leaseRunId, catalogueState: "reduced" });

  console.log(`Swapping in ${KEEP_TABLE} and dropping the full table`);
  await sql.begin(async (tx) => {
    for (const statement of swapStatements(schemaName, KEEP_TABLE)) {
      await tx.unsafe(statement);
    }
  });
  await sql.unsafe(dropOldTableSql(schemaName));
  await renewLease();

  const rowsLoaded = await loadShards({
    keys,
    schemaName,
    targetTable: NEW_TABLE,
    includeChangeType: false,
    renewLease,
  });
  console.log(`Loaded ${format(rowsLoaded)} rows into ${NEW_TABLE}`);

  for (const index of rebuildIndexCommands(schemaName)) {
    await runIndexDdl({ ...index, schemaName, renewLease });
  }

  console.log(`Analyzing ${NEW_TABLE} before the swap`);
  await sql.unsafe(`ANALYZE ${next}`);

  console.log(`Swapping in the rebuilt catalogue`);
  await sql.begin(async (tx) => {
    for (const statement of swapStatements(schemaName, NEW_TABLE)) {
      await tx.unsafe(statement);
    }
  });
  await sql.unsafe(dropOldTableSql(schemaName));

  await setCatalogueState(db, { runId: leaseRunId, catalogueState: "full" });

  return { rowsLoaded, keptRows };
}

export const openLibraryLoadPostgresTask = schemaTask({
  id: "openlibrary-load-postgres",
  schema: z.object({
    /**
     * Run id of the *orchestrator*, which owns the ETL lease.
     *
     * The lease identifies the pipeline for one dump, not a single trigger.dev
     * run. The orchestrator is suspended in `triggerAndWait` for this whole task
     * and cannot renew anything, so renewal happens here on its behalf.
     */
    leaseRunId: z.string(),
    dumpDate: z.string(),
    mode: z.enum(["delta", "full"]),
    exportPrefix: z.string(),
  }),
  machine: "small-1x",
  /**
   * Compute seconds, not wall-clock. trigger.dev aborts on sampled `cpuTime`
   * (see `UsageTimeoutManager`), and a checkpointed `wait.for` accumulates none
   * — the process is gone. So this does not cap how long an index build may
   * take: the polling loop burns a few seconds of CPU per wake, which against 12
   * hours of compute is months of wall-clock. Do not "fix" this by raising it
   * for a slow build; it is not the thing bounding one.
   */
  maxDuration: 12 * 60 * 60,
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ leaseRunId, dumpDate, mode, exportPrefix }) => {
    const s3 = new S3Client("etl");
    const db = createPostgresWriteDb({
      application_name: "openlibrary-etl-load",
    });
    const { sql } = db;

    const renewLease = async () => {
      const stillOurs = await renewEtlLease(db, { runId: leaseRunId });
      if (!stillOurs) {
        throw new Error(
          `Lost the ETL lease for dump ${dumpDate} — another run has taken over. ` +
            `Stopping before writing anything further.`,
        );
      }
    };

    try {
      const objects = await s3.listObjects(exportPrefix);
      const keys = objects
        .filter((object) => object.key.endsWith(".parquet"))
        .map((object) => object.key)
        .sort();

      if (keys.length === 0) {
        throw new Error(
          `No Parquet shards found under s3://${env.ETL_S3_BUCKET}/${exportPrefix}`,
        );
      }

      // Validates that search_path and APP_STAGE agree before anything writes.
      await assertTargetSchema(db);
      const startedAt = performance.now();
      console.log(
        `Loading ${keys.length} shards for dump ${dumpDate} into ` +
          `${schemaName}.${TARGET_TABLE} via the ${mode} path`,
      );

      const result =
        mode === "delta"
          ? await loadDelta({ sql, schemaName, keys, renewLease })
          : await loadFull({
              sql,
              db,
              schemaName,
              keys,
              leaseRunId,
              renewLease,
            });

      console.log(
        `Load complete in ${prettyMilliseconds(performance.now() - startedAt)}`,
      );

      return { dumpDate, mode, shardCount: keys.length, ...result };
    } finally {
      await sql.end();
    }
  },
});
