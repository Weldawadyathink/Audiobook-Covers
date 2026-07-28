import { schedules } from "@trigger.dev/sdk/v3";
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
import { openLibrarySyncWorksForPostgresTask } from "./sync-works-for-postgres";
import {
  acquireEtlLease,
  completeEtlRun,
  failEtlRun,
  renewEtlLease,
  LEASE_RENEW_INTERVAL_MS,
} from "./etl-state";
import { createPostgresWriteDb } from "@/db.node";
import { env } from "@/env.node";

const TARGET_QUERY = "works_search_ready";
const DATASET = "openlibrary";
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
 * replaced by the `(olid, row_hash)` table in sync-works-for-postgres.
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

export const openLibraryEtlTask = schedules.task({
  id: "openlibrary-etl",
  cron: "0 0 1 1 *", // Once a year to "disable" it
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async (_payload, { ctx }) => {
    const runId = ctx.run.id;
    const db = createPostgresWriteDb();
    const { sql } = db;

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

      console.log(
        `Claimed ETL lease for dump ${dumpDate} ` +
          `(previous completed dump: ${acquisition.state.completed_dump_date ?? "none"})`,
      );

      const heartbeat = setInterval(() => {
        void renewEtlLease(db, { runId })
          .then((stillOurs) => {
            if (!stillOurs) {
              console.error(
                `Lost the ETL lease — another run has taken over dump ${dumpDate}`,
              );
            }
          })
          .catch((error) => {
            console.error(`Failed to renew ETL lease`, error);
          });
      }, LEASE_RENEW_INTERVAL_MS);
      // Do not keep the process alive purely for the heartbeat.
      heartbeat.unref?.();

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
        }

        console.log(`Completed BigQuery search table build: ${TARGET_QUERY}`);

        const syncResult = await triggerAndWait({
          task: openLibrarySyncWorksForPostgresTask,
          payload: { dumpDate },
        });

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

        return { skipped: false as const, ...syncResult };
      } catch (error) {
        await failEtlRun(db, { runId, error });
        throw error;
      } finally {
        clearInterval(heartbeat);
      }
    } finally {
      await sql.end();
    }
  },
});
