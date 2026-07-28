import { wait } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { createPostgresWriteDb } from "@/db.node";
import { env } from "@/env.node";

/**
 * Runs long DDL detached from this process, via pg_cron.
 *
 * Two problems are being solved at once.
 *
 * **Correctness.** A `CREATE INDEX` runs in the backend owned by the client
 * connection, so disconnecting rolls it back. Worse,
 * `client_connection_check_interval` defaults to `0`, so the backend usually
 * runs the *entire* build, tries to write the result, finds a dead socket, and
 * only then aborts — full cost, no index. Anything that may run for an hour has
 * to be owned by a backend this process cannot kill by going away.
 *
 * **Billing.** Keeping a worker alive holding a Postgres connection for an hour
 * is billed for the whole hour. `wait.for` checkpoints the run instead, so the
 * sleep costs nothing; the run wakes every few minutes, reconnects, checks
 * progress, and disconnects again.
 */

/** How long the run sleeps between progress checks. Not billed. */
const POLL_INTERVAL_MINUTES = 5;

/**
 * Lead time between scheduling a job and its single pinned fire.
 *
 * pg_cron evaluates schedules at the top of each minute, so this has to clear a
 * whole minute boundary. 90 seconds guarantees at least 60 seconds of lead.
 */
const SCHEDULE_LEAD_SECONDS = 90;

/**
 * GIN builds on ~30M rows are dominated by sort/merge memory. The 64MB default
 * makes them dramatically slower. `maintenance_work_mem` is USERSET and scoped
 * to the single pg_cron backend, so the blast radius is that one build — but it
 * is still real memory on the instance, so tune it down if the server is small.
 */
const MAINTENANCE_WORK_MEM = "512MB";

/**
 * pg_cron lives in one database only (`postgres`), while the application runs
 * against `audiobookcovers`. The orchestrator therefore needs a second
 * connection purely to schedule, poll and unschedule. Derived from the existing
 * write URL rather than added as another secret.
 */
function adminConnectionUrl() {
  const url = new URL(env.DATABASE_WRITE_URL);
  url.pathname = "/postgres";
  return url.toString();
}

/** The database the scheduled command should actually execute against. */
function applicationDatabaseName() {
  const url = new URL(env.DATABASE_WRITE_URL);
  const name = url.pathname.replace(/^\//, "");
  if (!name) {
    throw new Error("DATABASE_WRITE_URL has no database name in its path");
  }
  return name;
}

/**
 * Opens a short-lived connection to the `postgres` database, runs `fn`, and
 * closes it. Every pg_cron interaction goes through this — holding the
 * connection open across a `wait.for` is exactly the cost this design exists to
 * avoid, and a checkpointed run cannot keep a socket alive anyway.
 */
async function withAdminDb<T>(
  fn: (db: ReturnType<typeof createPostgresWriteDb>) => Promise<T>,
): Promise<T> {
  const adminUrl = adminConnectionUrl();
  const db = createPostgresWriteDb({
    env: { DATABASE_WRITE_URL: adminUrl, DATABASE_READ_URL: adminUrl },
    application_name: "openlibrary-etl-pgcron",
  });
  try {
    return await fn(db);
  } finally {
    await db.sql.end();
  }
}

const JobRunDetail = z.object({
  status: z.string(),
  return_message: z.string().nullable(),
  start_time: z.date().nullable(),
  end_time: z.date().nullable(),
});

export type PgCronOutcome =
  | { state: "succeeded"; message: string | null }
  | { state: "failed"; message: string | null };

/**
 * Schedules `command` to run exactly once, roughly a minute from now.
 *
 * pg_cron does not reliably suppress a scheduled fire while a previous run of
 * the same job is still going, so a long `CREATE INDEX` on a short recurring
 * schedule risks stacking concurrent index builds on the same table.
 *
 * Self-unscheduling does not fix that: `CREATE INDEX …; SELECT cron.unschedule(…)`
 * only reaches the unschedule after the hour-long build finishes, by which point
 * every intervening fire has already happened. (It is not even available here —
 * the command runs in `audiobookcovers`, where the `cron` schema does not
 * exist.)
 *
 * Instead the schedule is pinned to a concrete minute *and day and month*, so it
 * fires once and does not naturally recur for a year. Correctness stops
 * depending on pg_cron's overlap semantics entirely, and a missed unschedule
 * becomes harmless rather than catastrophic. The cost is up to a minute of start
 * latency against an hour-long build.
 */
async function scheduleOneShot(jobName: string, command: string) {
  return await withAdminDb(async ({ sqlTools }) => {
    // Computed from the *server's* clock in the *cron* timezone, not from
    // Node's. A pinned schedule derived from a clock or zone the scheduler does
    // not share fires at the wrong time, or up to a year late.
    const { schedule } = await sqlTools.one(z.object({ schedule: z.string() }))`
      SELECT to_char(
        (now() AT TIME ZONE COALESCE(current_setting('cron.timezone', true), 'GMT'))
          + make_interval(secs => ${SCHEDULE_LEAD_SECONDS}),
        'MI HH24 DD MM'
      ) || ' *' AS schedule
    `;

    // Drop any leftover job of the same name first. Unscheduling a job that
    // does not exist raises, hence the existence check.
    await sqlTools.unsafe`
      SELECT cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = ${jobName}
    `;

    const { jobid } = await sqlTools.one(
      z.object({ jobid: z.coerce.number() }),
    )`
      SELECT cron.schedule_in_database(
        ${jobName},
        ${schedule},
        ${command},
        ${applicationDatabaseName()}
      ) AS jobid
    `;

    console.log(
      `Scheduled pg_cron job "${jobName}" (jobid ${jobid}) for '${schedule}' ` +
        `in database ${applicationDatabaseName()}`,
    );

    return { jobid, schedule };
  });
}

async function readLatestRun(jobid: number) {
  return await withAdminDb(async ({ sqlTools }) => {
    return await sqlTools.maybeOne(JobRunDetail)`
      SELECT status, return_message, start_time, end_time
      FROM cron.job_run_details
      WHERE jobid = ${jobid}
      ORDER BY runid DESC
      LIMIT 1
    `;
  });
}

async function unschedule(jobid: number) {
  await withAdminDb(async ({ sqlTools }) => {
    await sqlTools.unsafe`
      SELECT cron.unschedule(jobid)
      FROM cron.job
      WHERE jobid = ${jobid}
    `;
  });
}

const IndexProgress = z.object({
  phase: z.string().nullable(),
  blocks_done: z.coerce.number().nullable(),
  blocks_total: z.coerce.number().nullable(),
  tuples_done: z.coerce.number().nullable(),
  tuples_total: z.coerce.number().nullable(),
});

/**
 * Live index-build progress, read from the application database.
 *
 * This is what makes each wake-up informative rather than blind — without it a
 * step that may run an hour is indistinguishable from a step that has hung.
 */
export async function readIndexProgress(
  db: Pick<ReturnType<typeof createPostgresWriteDb>, "sqlTools">,
) {
  const rows = await db.sqlTools.any(IndexProgress)`
    SELECT phase, blocks_done, blocks_total, tuples_done, tuples_total
    FROM pg_stat_progress_create_index
    WHERE datid = (SELECT oid FROM pg_database WHERE datname = current_database())
  `;
  return rows.at(0) ?? null;
}

export function formatIndexProgress(
  progress: Awaited<ReturnType<typeof readIndexProgress>>,
) {
  if (!progress) return "no index build in progress";
  const parts = [progress.phase ?? "unknown phase"];
  if (progress.blocks_total) {
    const pct = ((progress.blocks_done ?? 0) / progress.blocks_total) * 100;
    parts.push(`blocks ${pct.toFixed(1)}%`);
  }
  if (progress.tuples_total) {
    const pct = ((progress.tuples_done ?? 0) / progress.tuples_total) * 100;
    parts.push(`tuples ${pct.toFixed(1)}%`);
  }
  return parts.join(", ");
}

/**
 * Schedules `command` via pg_cron and sleeps until it finishes.
 *
 * `onWake` runs on every poll, awake and with no connection held by this
 * helper. It is where the caller renews the ETL lease — the run is suspended
 * between polls, so no timer-based heartbeat can fire, and this is the only
 * moment renewal is possible.
 */
export async function runDetachedDdl({
  jobName,
  command,
  timeoutMinutes,
  onWake,
}: {
  jobName: string;
  command: string;
  timeoutMinutes: number;
  onWake?: () => Promise<void>;
}): Promise<PgCronOutcome> {
  // The SET applies only to the single pg_cron backend that runs this command,
  // and only for its lifetime.
  const { jobid } = await scheduleOneShot(
    jobName,
    `SET maintenance_work_mem = '${MAINTENANCE_WORK_MEM}'; ${command}`,
  );

  const deadline = Date.now() + timeoutMinutes * 60_000;

  try {
    for (;;) {
      await wait.for({ minutes: POLL_INTERVAL_MINUTES });
      await onWake?.();

      const run = await readLatestRun(jobid);

      if (!run) {
        console.log(`pg_cron job "${jobName}" has not started yet`);
      } else if (run.status === "succeeded") {
        console.log(`pg_cron job "${jobName}" succeeded`);
        return { state: "succeeded", message: run.return_message };
      } else if (run.status === "failed") {
        console.error(
          `pg_cron job "${jobName}" failed: ${run.return_message ?? "no message"}`,
        );
        return { state: "failed", message: run.return_message };
      } else {
        console.log(
          `pg_cron job "${jobName}" is ${run.status} ` +
            `(started ${run.start_time?.toISOString() ?? "unknown"})`,
        );
      }

      if (Date.now() > deadline) {
        return {
          state: "failed",
          message:
            `Timed out after ${timeoutMinutes} minutes waiting for pg_cron job ` +
            `"${jobName}". The build may still be running in the database — ` +
            `check cron.job_run_details before retrying.`,
        };
      }
    }
  } finally {
    // The year-out pin means a failure here is harmless, so this is best-effort
    // rather than something worth failing the run over.
    try {
      await unschedule(jobid);
    } catch (error) {
      console.error(
        `Failed to unschedule pg_cron job "${jobName}" (jobid ${jobid}). ` +
          `It is pinned a year out, so it will not fire again before then.`,
        error,
      );
    }
  }
}
