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

/**
 * How long the run sleeps between progress checks. Not billed.
 *
 * Tightest early, when a job is most likely to fail outright or fail to start,
 * then backing off — over a build that may run most of a day, a 5-minute cadence
 * is hundreds of near-identical log lines for no extra information.
 */
function pollIntervalMinutes(elapsedMinutes: number) {
  return elapsedMinutes < 60 ? 5 : 15;
}

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
 * **There is deliberately no completion deadline.** The work happens in a
 * pg_cron backend this process does not own, so a timeout here would not stop
 * anything — it would abandon a build that is still making progress and throw
 * away hours of it, then start the next attempt from zero. A GIN build over ~30M
 * rows on a low-CPU instance is legitimately measured in many hours, and no
 * constant picked in advance can tell "slow" from "stuck". A build that really
 * does run forever is a human's problem; this just keeps polling and reporting
 * so a human can see it.
 *
 * The one thing that *is* bounded is whether the job ever **starts**. That is a
 * different failure with a different cause — a schedule that never fired, a
 * missing `GRANT`, a wrong database name — and it would otherwise hang silently
 * and indefinitely with nothing to look at.
 *
 * `onWake` runs on every poll, awake and with no connection held by this helper.
 * It is where the caller renews the ETL lease — the run is suspended between
 * polls, so no timer-based heartbeat can fire, and this is the only moment
 * renewal is possible.
 */
export async function runDetachedDdl({
  jobName,
  command,
  searchPath,
  hasCompleted,
  hasStarted,
  startTimeoutMinutes = 15,
  onWake,
}: {
  jobName: string;
  command: string;
  /**
   * Schema to put on the command's `search_path`, ahead of `public`.
   *
   * Defence in depth, not a fix for a live failure. The pg_cron backend is a
   * fresh session that does not inherit the orchestrator's `search_path`, and
   * the author GIN index expression calls the unqualified
   * `immutable_array_to_string`. That resolves today because the function lives
   * in `public` and `public` is on the default path — verified, not assumed.
   *
   * Setting it explicitly removes the dependency on that being true. A
   * database- or role-level `search_path` that drops `public` would otherwise
   * break the build *after* 30M rows had been loaded, which is an expensive
   * place to discover a configuration change.
   *
   * It does not affect what the planner matches: expression indexes are compared
   * by resolved function OID, not by the text of the definition.
   */
  searchPath?: string;
  /**
   * Authoritative check that the object now exists.
   *
   * Preferred over `cron.job_run_details`, which is only advisory: `cron.log_run`
   * can be disabled, leaving the run log permanently empty. The object being
   * there is the only thing that actually matters.
   */
  hasCompleted: () => Promise<boolean>;
  /**
   * Optional evidence the work is underway even when the run log is empty, so a
   * cluster with `cron.log_run` off is not mistaken for one that never started.
   */
  hasStarted?: () => Promise<boolean>;
  /** Bounds only "did it ever begin", never "how long may it take". */
  startTimeoutMinutes?: number;
  onWake?: () => Promise<void>;
}): Promise<PgCronOutcome> {
  // Both SETs apply only to the single pg_cron backend that runs this command,
  // and only for its lifetime.
  const prelude = [
    searchPath
      ? `SET search_path = "${searchPath.replaceAll('"', '""')}", public;`
      : null,
    `SET maintenance_work_mem = '${MAINTENANCE_WORK_MEM}';`,
  ]
    .filter(Boolean)
    .join(" ");

  const { jobid } = await scheduleOneShot(jobName, `${prelude} ${command}`);

  const scheduledAt = Date.now();
  let observedStart = false;

  try {
    for (;;) {
      const elapsedMinutes = (Date.now() - scheduledAt) / 60_000;
      await wait.for({ minutes: pollIntervalMinutes(elapsedMinutes) });
      await onWake?.();

      // Authoritative check first: on the happy path the run log is never
      // consulted at all.
      if (await hasCompleted()) {
        console.log(
          `pg_cron job "${jobName}" completed after ${elapsedMinutes.toFixed(0)} minutes`,
        );
        return { state: "succeeded", message: null };
      }

      const run = await readLatestRun(jobid);

      if (run?.status === "failed") {
        console.error(
          `pg_cron job "${jobName}" failed: ${run.return_message ?? "no message"}`,
        );
        return { state: "failed", message: run.return_message };
      }

      if (run?.status === "succeeded") {
        // The log claims success but the object is not there. Reporting this as
        // success would swap a table with a missing index into production, where
        // it degrades every search to a sequential scan instead of failing.
        return {
          state: "failed",
          message:
            `pg_cron job "${jobName}" reported success but the object it should ` +
            `have created is missing. Return message: ${run.return_message ?? "none"}`,
        };
      }

      if (run || (await hasStarted?.())) {
        observedStart = true;
        console.log(
          `pg_cron job "${jobName}" is ${run?.status ?? "running"} after ` +
            `${elapsedMinutes.toFixed(0)} minutes`,
        );
        continue;
      }

      if (!observedStart && elapsedMinutes > startTimeoutMinutes) {
        return {
          state: "failed",
          message:
            `pg_cron job "${jobName}" never started: no run recorded and no work ` +
            `in progress ${elapsedMinutes.toFixed(0)} minutes after scheduling it ` +
            `(it was pinned to fire within ~2 minutes). Check that the ` +
            `audiobookcovers role may call cron.schedule_in_database, that ` +
            `cron.job still holds the job, and that cron.database_name is correct.`,
        };
      }

      console.log(`pg_cron job "${jobName}" has not started yet`);
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
