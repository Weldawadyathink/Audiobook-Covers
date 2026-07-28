import { schedules, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import formatNumber from "format-number";
import { resolveDumpDate } from "@/trigger/openlibrary/utils";
import { BQClient } from "./bq";
import { S3Client } from "./s3";
import {
  getProcessingTableNames,
  getQueryForTarget,
  queries,
  renderSql,
} from "./queries";
import { triggerAndWait } from "../utils";
import { openLibraryDownloadToS3Task } from "./download-to-s3";
import { openLibraryLoadPostgresTask } from "./load-postgres";
import {
  DATASET,
  DELTA_RATIO_THRESHOLD,
  advanceCheckpoint,
  ensureCheckpointTable,
  exportPrefixFor,
  exportToParquet,
  measureDelta,
  type DeltaStats,
  type ExportMode,
} from "./export";
import {
  acquireEtlLease,
  completeEtlRun,
  failEtlRun,
  renewEtlLease,
} from "./etl-state";
import { createPostgresWriteDb } from "@/db.node";
import { env } from "@/env.node";

const format = formatNumber({ round: 0 });

const TARGET_QUERY = "works_search_ready";
const DUMP_URL = "https://openlibrary.org/data/ol_dump_latest.txt.gz";

// Keyed by dump date so a retry can tell whether the CSV already on disk is the
// one it needs. Retention is a bucket lifecycle rule on the `openlibrary/`
// prefix (see infra/gcs-lifecycle.json), not an inline delete.
function csvKeyFor(dumpDate: string) {
  return `openlibrary/${dumpDate}/all.csv`;
}

/**
 * Superseded tables that are not part of the query DAG, so cannot be derived
 * from it. `works_for_postgres_synced` was the old full-copy checkpoint, since
 * replaced by the `(olid, row_hash)` table.
 */
const LEGACY_TABLES = ["works_for_postgres_synced"];

/**
 * Drops the intermediate tables once a run has succeeded. Best-effort: the data
 * is already in Postgres and the checkpoint is advanced by this point, so a
 * failure here is a storage-cost problem, not a correctness one.
 *
 * Only runs on success — a failed run leaves its tables in place to be inspected.
 */
async function dropProcessingTables(bq: BQClient, tables: string[]) {
  const script = tables
    .map(
      (table) =>
        `DROP TABLE IF EXISTS \`${bq.projectId}.${DATASET}.${table}\`;`,
    )
    .join("\n");

  console.log(
    `Dropping ${tables.length} processing tables: ${tables.join(", ")}`,
  );
  const job = await bq.createQueryJob(script);
  await job.promise();
  console.log(`Dropped processing tables`);
}

function describeDelta(stats: DeltaStats) {
  return (
    `${format(stats.upsertCount)} upserts + ${format(stats.deleteCount)} deletes ` +
    `against ${format(stats.currentRowCount)} incoming rows ` +
    `(checkpoint holds ${format(stats.syncedRowCount)}), ` +
    `change ratio ${(stats.changeRatio * 100).toFixed(2)}%`
  );
}

/**
 * Picks the export mode, or refuses to guess.
 *
 * The mode has to be decided *before* BigQuery exports: the delta export joins
 * against the checkpoint and emits `change_type`, while a full export just dumps
 * the table. They are different queries producing different columns, so this
 * cannot be chosen after the fact from whatever landed in GCS.
 *
 * The threshold check doubles as the delete blast-radius guard, deliberately,
 * because from inside the pipeline the two situations are indistinguishable:
 *
 * - a truncated OpenLibrary dump (mostly deletes) — must not be applied
 * - a legitimate schema change (mostly upserts) — needs `fullRebuild: true`
 *
 * Only a human can tell those apart, so the run stops and reports the numbers it
 * saw rather than picking one interpretation and destroying the catalogue.
 */
function decideExportMode({
  stats,
  fullRebuild,
  catalogueState,
}: {
  stats: DeltaStats;
  fullRebuild: boolean;
  catalogueState: string;
}): ExportMode {
  if (catalogueState === "reduced") {
    // A previous run died between the two swaps, so `openlibrary_work` holds
    // only referenced OLIDs. A delta against a checkpoint that describes the
    // full catalogue would leave it permanently incomplete.
    console.log(
      `Catalogue is 'reduced' from an earlier interrupted run — forcing a full rebuild`,
    );
    return "full";
  }

  if (fullRebuild) {
    console.log(`Full rebuild requested explicitly — ${describeDelta(stats)}`);
    return "full";
  }

  if (stats.syncedRowCount === 0) {
    throw new Error(
      `The BigQuery checkpoint is empty, so every one of ${format(stats.currentRowCount)} ` +
        `rows would ship as an individual upsert. That is either a first run or a lost ` +
        `checkpoint; both want the build-and-swap path. Re-run with fullRebuild: true.`,
    );
  }

  if (stats.changeRatio > DELTA_RATIO_THRESHOLD) {
    throw new Error(
      `Delta is too large to apply as a delta: ${describeDelta(stats)}, over the ` +
        `${(DELTA_RATIO_THRESHOLD * 100).toFixed(0)}% threshold. This is either a ` +
        `truncated OpenLibrary dump (which must not be applied) or a legitimate ` +
        `schema change (which wants fullRebuild: true). Check the dump before choosing.`,
    );
  }

  console.log(`Applying as a delta — ${describeDelta(stats)}`);
  return "delta";
}

/**
 * Monthly OpenLibrary dump → BigQuery transform → Postgres catalogue.
 *
 * A `schemaTask` rather than a `schedules.task` so it can take parameters;
 * `schedules.task` has a fixed payload shape and could never carry
 * `fullRebuild`. {@link openLibraryEtlScheduleTask} is the thin scheduled
 * wrapper, which also makes manual and parameterised runs possible.
 */
export const openLibraryEtlTask = schemaTask({
  id: "openlibrary-etl",
  schema: z.object({
    /**
     * Export every row and rebuild the table from scratch, instead of diffing
     * against the checkpoint. Needed after a schema change, after a lost
     * checkpoint, and for the first run.
     */
    fullRebuild: z.boolean().default(false),
  }),
  machine: "small-1x",
  maxDuration: 12 * 60 * 60,
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ fullRebuild }, { ctx }) => {
    const runId = ctx.run.id;
    const db = createPostgresWriteDb({ application_name: "openlibrary-etl" });
    const { sql } = db;

    /**
     * Renewal is explicit and only happens here, at points where the run is
     * awake. There is deliberately no timer: `wait.for` and `triggerAndWait`
     * checkpoint and serialise the run — which is the entire reason the sleeps
     * are not billed — and a suspended run's `setInterval` never fires. A
     * heartbeat that silently stops is worse than none, because the lease lapses
     * mid-run and a second run can take over.
     */
    const renewLease = async () => {
      const stillOurs = await renewEtlLease(db, { runId });
      if (!stillOurs) {
        throw new Error(
          `Lost the ETL lease — another run has taken over. Stopping.`,
        );
      }
    };

    try {
      console.log("Resolving latest dump date from OpenLibrary...");
      const dumpDate = await resolveDumpDate(DUMP_URL);
      console.log(`Latest dump date: ${dumpDate}`);

      const acquisition = await acquireEtlLease(db, { dumpDate, runId });
      if (!acquisition.acquired) {
        const { reason, state } = acquisition;
        if (reason === "already_completed") {
          console.log(
            `Skipping: dump ${dumpDate} already completed at ${state.completed_at?.toISOString()}`,
          );
        } else {
          console.log(
            `Skipping: run ${state.active_run_id} is already processing dump ` +
              `${state.active_dump_date} (lease valid until ${state.lease_expires_at?.toISOString()})`,
          );
        }
        return { skipped: true as const, reason, dumpDate };
      }

      const catalogueState = acquisition.state.catalogue_state;
      console.log(
        `Claimed ETL lease for dump ${dumpDate} ` +
          `(previous completed dump: ${acquisition.state.completed_dump_date ?? "none"}, ` +
          `catalogue: ${catalogueState})`,
      );

      try {
        const csvKey = csvKeyFor(dumpDate);
        const bq = new BQClient();
        const sqlVariables = {
          project: bq.projectId,
          dataset: DATASET,
          bucket: env.ETL_S3_BUCKET,
          csvKey,
        };

        const s3 = new S3Client("etl");
        const existing = await s3.listObjects(csvKey);
        const alreadyDownloaded = existing.some(
          (object) => object.key === csvKey && (object.size ?? 0) > 0,
        );

        if (alreadyDownloaded) {
          // A multipart upload only becomes visible once completed, so presence
          // of the key means the download finished.
          console.log(
            `Reusing already-downloaded dump at s3://${s3.bucket}/${csvKey}`,
          );
        } else {
          console.log(`Downloading complete dump to google storage`);
          await triggerAndWait({
            task: openLibraryDownloadToS3Task,
            payload: {
              destinationKey: csvKey,
              sourceUrl: DUMP_URL,
            },
            options: {
              machine: "medium-1x",
            },
          });
          console.log(`Downloaded complete dump to google storage`);
        }
        await renewLease();

        for (const runnableQueries of getQueryForTarget(
          queries,
          TARGET_QUERY,
        )) {
          console.log(
            `Running BigQuery batch in ${bq.location}: ${runnableQueries
              .map((query) => query.name)
              .join(", ")}`,
          );

          await Promise.all(
            runnableQueries.map(async (query) => {
              console.log(`Starting BigQuery query: ${query.name}`);

              const job = await bq.createQueryJob(
                renderSql(query.query, sqlVariables),
              );
              await job.promise();

              console.log(
                `Completed BigQuery query: ${query.name} (${job.id})`,
              );
            }),
          );

          await renewLease();
        }

        console.log(`Completed BigQuery search table build: ${TARGET_QUERY}`);

        await ensureCheckpointTable(bq);
        const deltaStats = await measureDelta(bq);
        const mode = decideExportMode({
          stats: deltaStats,
          fullRebuild,
          catalogueState,
        });
        await renewLease();

        const exportPrefix = exportPrefixFor(dumpDate, runId);
        console.log(`Exporting ${mode} Parquet to ${exportPrefix}`);
        await exportToParquet(bq, {
          mode,
          bucket: env.ETL_S3_BUCKET,
          prefix: exportPrefix,
        });
        await renewLease();

        const loadResult = await triggerAndWait({
          task: openLibraryLoadPostgresTask,
          payload: { leaseRunId: runId, dumpDate, mode, exportPrefix },
        });

        // Strictly after the Postgres write. A checkpoint that runs ahead of the
        // data is silent, permanent drift: the next run diffs against it, sees
        // nothing to do, and never ships the missing rows.
        await advanceCheckpoint(bq);
        await completeEtlRun(db, { dumpDate, runId });
        console.log(`Recorded successful OpenLibrary dump ${dumpDate}`);

        // After completeEtlRun: the run is durably successful at this point, so
        // a cleanup failure should not mark it failed and trigger a re-run.
        try {
          await dropProcessingTables(bq, [
            ...getProcessingTableNames(queries, TARGET_QUERY),
            ...LEGACY_TABLES,
          ]);
        } catch (error) {
          console.error(
            `Failed to drop processing tables — they will be replaced by the next run, but are billing storage until then`,
            error,
          );
        }

        return { skipped: false as const, mode, deltaStats, ...loadResult };
      } catch (error) {
        await failEtlRun(db, { runId, error });
        throw error;
      }
    } finally {
      await sql.end();
    }
  },
});

/**
 * Scheduled entry point. Pinned to once a year to keep it effectively disabled;
 * change the cron here when the pipeline is ready to run unattended.
 *
 * Triggers rather than awaits: a scheduled run should not stay open for the
 * hours the ETL takes. Overlap is prevented by the queue concurrency limit and
 * the Postgres lease, not by this task's lifetime.
 */
export const openLibraryEtlScheduleTask = schedules.task({
  id: "openlibrary-etl-schedule",
  cron: "0 0 1 1 *",
  run: async () => {
    const handle = await openLibraryEtlTask.trigger({ fullRebuild: false });
    console.log(`Triggered OpenLibrary ETL run ${handle.id}`);
    return { runId: handle.id };
  },
});
