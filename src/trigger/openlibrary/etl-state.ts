import { z } from "zod/v4";
import type { createPostgresWriteDb } from "@/db.node";
import { schemaName } from "@/db/schema";

type WriteDb = ReturnType<typeof createPostgresWriteDb>;

/**
 * Qualified name of the state table, derived from `APP_STAGE` via
 * {@link schemaName} — the same source Drizzle uses.
 *
 * Interpolated through postgres.js's identifier helper (`sql(...)`), which
 * escapes on `.` and so renders `"prod"."openlibrary_etl_state"`. Every
 * statement here is qualified for one reason: this database still carries a
 * legacy `audiobookcovers` schema whose `openlibrary_etl_state` has a different,
 * smaller shape. An unqualified reference follows the role's `search_path`, so
 * it silently addressed the wrong table depending on server-side role
 * configuration this code cannot see.
 */
const ETL_STATE_TABLE = `${schemaName}.openlibrary_etl_state`;

/**
 * How long a claim stays valid without renewal. A run that is OOM-killed or
 * loses its machine leaves `status = 'running'` behind; once the lease lapses the
 * next scheduled run reclaims it instead of refusing forever.
 *
 * 24 hours, which is far longer than a heartbeat-based lease would need, because
 * this run does not heartbeat. `wait.for` checkpoints the run — the whole point,
 * since sleeping that way is not billed — and a suspended run cannot renew
 * anything. Renewal therefore happens only at points where the run is awake and
 * holding a connection: after each BigQuery batch, between loader waves, and on
 * every poll wake-up. The TTL has to cover the longest gap between two of those.
 *
 * That gap is set by PlanetScale, not by this code. The instance is deliberately
 * low-CPU, and past runs have taken many hours; a single wave of Parquet loaders
 * writing into a saturated database can be slow enough that any TTL picked from
 * the *code's* structure rather than from the *database's* throughput is wrong.
 *
 * The asymmetry makes a generous value the easy call. The job runs monthly, so a
 * crashed run blocking retries for a day costs nothing — and a human can clear
 * the row in seconds. A TTL that expires mid-run, by contrast, lets a second run
 * start writing alongside the first, which is the failure this exists to
 * prevent.
 */
export const LEASE_DURATION_SECONDS = 24 * 60 * 60;

export const CatalogueState = z.enum(["full", "reduced"]);
export type CatalogueState = z.infer<typeof CatalogueState>;

export const EtlState = z.object({
  status: z.enum(["idle", "running", "failed"]),
  completed_dump_date: z.string().nullable(),
  completed_at: z.date().nullable(),
  active_dump_date: z.string().nullable(),
  active_run_id: z.string().nullable(),
  started_at: z.date().nullable(),
  lease_expires_at: z.date().nullable(),
  catalogue_state: CatalogueState,
  last_error: z.string().nullable(),
  updated_at: z.date(),
});

export type EtlState = z.infer<typeof EtlState>;

export type AcquireResult =
  | { acquired: true; state: EtlState }
  | {
      acquired: false;
      reason: "already_completed" | "run_in_progress";
      state: EtlState;
    };

/**
 * Verifies the tables this ETL targets actually exist in the expected schema.
 *
 * Every statement in the pipeline is schema-qualified from `APP_STAGE`, so this
 * is no longer about `search_path` — it cannot be wrong-by-configuration any
 * more. What it still catches is the schema push not having been applied to the
 * stage this process is pointed at, which would otherwise surface as a relation
 * error somewhere deep in the run, after the dump download and the BigQuery
 * transform.
 */
export async function assertTargetSchema({
  sql,
  sqlTools,
}: WriteDb): Promise<void> {
  const row = await sqlTools.one(
    z.object({
      work: z.string().nullable(),
      state: z.string().nullable(),
      image: z.string().nullable(),
    }),
  )`
    SELECT
      to_regclass(${`${schemaName}.openlibrary_work`})::text AS work,
      to_regclass(${ETL_STATE_TABLE})::text AS state,
      to_regclass(${`${schemaName}.image`})::text AS image
  `;
  void sql;

  const missing = Object.entries(row)
    .filter(([, value]) => value === null)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Schema "${schemaName}" (from APP_STAGE) is missing: ${missing.join(", ")}. ` +
        `Run the Drizzle push for this stage before starting the ETL.`,
    );
  }
}

/**
 * Reads current state, creating the singleton row on first use.
 *
 * The bootstrap is `ON CONFLICT DO UPDATE` rather than `DO NOTHING` because
 * `DO NOTHING` returns no row when one already exists. The original
 * implementation used a data-modifying CTE (`WITH upsert AS (INSERT ...)
 * SELECT ...`), where the insert is invisible to the reading statement — so the
 * very first call always returned zero rows and threw.
 */
export async function readEtlState({
  sql,
  sqlTools,
}: WriteDb): Promise<EtlState> {
  return await sqlTools.one(EtlState)`
    INSERT INTO ${sql(ETL_STATE_TABLE)} AS state (id, status)
    VALUES (true, 'idle')
    ON CONFLICT (id) DO UPDATE SET id = state.id
    RETURNING
      status,
      completed_dump_date,
      completed_at,
      active_dump_date,
      active_run_id,
      started_at,
      lease_expires_at,
      catalogue_state,
      last_error,
      updated_at
  `;
}

/**
 * Atomically claims the ETL for `dumpDate`.
 *
 * The claim is a single conditional UPDATE, so concurrent callers cannot both
 * succeed — the loser's `WHERE` sees the winner's committed row. Checking state
 * first and writing second (as the previous code did) is a TOCTOU race that lets
 * two runs proceed together.
 */
export async function acquireEtlLease(
  db: WriteDb,
  { dumpDate, runId }: { dumpDate: string; runId: string },
): Promise<AcquireResult> {
  const { sql, sqlTools } = db;

  const claimed = await sqlTools.any(EtlState)`
    INSERT INTO ${sql(ETL_STATE_TABLE)} AS state (
      id, status, active_dump_date, active_run_id,
      started_at, lease_expires_at, last_error, updated_at
    )
    VALUES (
      true, 'running', ${dumpDate}, ${runId},
      now(), now() + make_interval(secs => ${LEASE_DURATION_SECONDS}), NULL, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'running',
      active_dump_date = EXCLUDED.active_dump_date,
      active_run_id = EXCLUDED.active_run_id,
      started_at = now(),
      lease_expires_at = EXCLUDED.lease_expires_at,
      last_error = NULL,
      updated_at = now()
    WHERE
      state.completed_dump_date IS DISTINCT FROM ${dumpDate}
      AND (
        state.status <> 'running'
        OR state.lease_expires_at IS NULL
        OR state.lease_expires_at < now()
      )
    RETURNING
      status,
      completed_dump_date,
      completed_at,
      active_dump_date,
      active_run_id,
      started_at,
      lease_expires_at,
      catalogue_state,
      last_error,
      updated_at
  `;

  if (claimed.length === 1) {
    return { acquired: true, state: claimed[0] };
  }

  // Zero rows means the guard rejected the claim. Re-read to say which arm.
  const state = await readEtlState(db);
  return {
    acquired: false,
    reason:
      state.completed_dump_date === dumpDate
        ? "already_completed"
        : "run_in_progress",
    state,
  };
}

/**
 * Extends the lease. Scoped to `runId` so a run that already lost its lease to a
 * takeover cannot resurrect it and start writing alongside the new owner.
 * Returns false if the lease is no longer ours.
 */
export async function renewEtlLease(
  { sql, sqlTools }: WriteDb,
  { runId }: { runId: string },
): Promise<boolean> {
  const renewed = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE ${sql(ETL_STATE_TABLE)}
    SET
      lease_expires_at = now() + make_interval(secs => ${LEASE_DURATION_SECONDS}),
      updated_at = now()
    WHERE id = true
      AND status = 'running'
      AND active_run_id = ${runId}
    RETURNING id
  `;
  return renewed.length === 1;
}

/**
 * Records whether `openlibrary_work` currently holds the whole catalogue.
 *
 * Run-scoped like the other mutations, so a run that has already lost its lease
 * cannot flip the flag back to `full` underneath the run that took over.
 *
 * Deliberately *not* cleared by {@link failEtlRun}: a run that dies between the
 * two swaps leaves a reduced catalogue behind, and search has to stay blocked
 * until a later run rebuilds it.
 */
export async function setCatalogueState(
  { sql, sqlTools }: WriteDb,
  { runId, catalogueState }: { runId: string; catalogueState: CatalogueState },
): Promise<boolean> {
  const updated = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE ${sql(ETL_STATE_TABLE)}
    SET
      catalogue_state = ${catalogueState},
      updated_at = now()
    WHERE id = true
      AND active_run_id = ${runId}
    RETURNING id
  `;
  return updated.length === 1;
}

/**
 * Reads the catalogue flag alone, for consumers that must not act on a reduced
 * catalogue. Returns `full` when the singleton row does not exist yet — an
 * absent row means no ETL has ever run, so nothing has been reduced.
 */
export async function readCatalogueState({
  sql,
  sqlTools,
}: Pick<WriteDb, "sql" | "sqlTools">): Promise<CatalogueState> {
  const row = await sqlTools.maybeOne(
    z.object({ catalogue_state: CatalogueState }),
  )`
    SELECT catalogue_state FROM ${sql(ETL_STATE_TABLE)} WHERE id = true
  `;
  return row?.catalogue_state ?? "full";
}

/** Marks the claimed dump as fully applied and drops the lease. */
export async function completeEtlRun(
  { sql, sqlTools }: WriteDb,
  { dumpDate, runId }: { dumpDate: string; runId: string },
): Promise<boolean> {
  const released = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE ${sql(ETL_STATE_TABLE)}
    SET
      status = 'idle',
      completed_dump_date = ${dumpDate},
      completed_at = now(),
      active_dump_date = NULL,
      active_run_id = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      updated_at = now()
    WHERE id = true
      AND active_run_id = ${runId}
    RETURNING id
  `;
  return released.length === 1;
}

/**
 * Records a failure and drops the lease so the next run can retry immediately
 * rather than waiting out the lease.
 */
export async function failEtlRun(
  { sql, sqlTools }: WriteDb,
  { runId, error }: { runId: string; error: unknown },
): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const released = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE ${sql(ETL_STATE_TABLE)}
    SET
      status = 'failed',
      active_run_id = NULL,
      lease_expires_at = NULL,
      last_error = ${message.slice(0, 2000)},
      updated_at = now()
    WHERE id = true
      AND active_run_id = ${runId}
    RETURNING id
  `;
  return released.length === 1;
}
