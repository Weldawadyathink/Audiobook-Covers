import { z } from "zod/v4";
import type { createPostgresWriteDb } from "@/db.node";

type WriteDb = ReturnType<typeof createPostgresWriteDb>;

/**
 * How long a claim stays valid without a heartbeat. A run that is OOM-killed or
 * loses its machine leaves `status = 'running'` behind; once the lease lapses the
 * next scheduled run reclaims it instead of refusing forever.
 */
export const LEASE_DURATION_SECONDS = 5 * 60;

/** Heartbeat cadence. Must be comfortably under {@link LEASE_DURATION_SECONDS}. */
export const LEASE_RENEW_INTERVAL_MS = 60_000;

export const EtlState = z.object({
  status: z.enum(["idle", "running", "failed"]),
  completed_dump_date: z.string().nullable(),
  completed_at: z.date().nullable(),
  active_dump_date: z.string().nullable(),
  active_run_id: z.string().nullable(),
  started_at: z.date().nullable(),
  lease_expires_at: z.date().nullable(),
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
 * Reads current state, creating the singleton row on first use.
 *
 * The bootstrap is `ON CONFLICT DO UPDATE` rather than `DO NOTHING` because
 * `DO NOTHING` returns no row when one already exists. The original
 * implementation used a data-modifying CTE (`WITH upsert AS (INSERT ...)
 * SELECT ...`), where the insert is invisible to the reading statement — so the
 * very first call always returned zero rows and threw.
 */
export async function readEtlState({ sqlTools }: WriteDb): Promise<EtlState> {
  return await sqlTools.one(EtlState)`
    INSERT INTO openlibrary_etl_state (id, status)
    VALUES (true, 'idle')
    ON CONFLICT (id) DO UPDATE SET id = openlibrary_etl_state.id
    RETURNING
      status,
      completed_dump_date,
      completed_at,
      active_dump_date,
      active_run_id,
      started_at,
      lease_expires_at,
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
  const { sqlTools } = db;

  const claimed = await sqlTools.any(EtlState)`
    INSERT INTO openlibrary_etl_state (
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
      openlibrary_etl_state.completed_dump_date IS DISTINCT FROM ${dumpDate}
      AND (
        openlibrary_etl_state.status <> 'running'
        OR openlibrary_etl_state.lease_expires_at IS NULL
        OR openlibrary_etl_state.lease_expires_at < now()
      )
    RETURNING
      status,
      completed_dump_date,
      completed_at,
      active_dump_date,
      active_run_id,
      started_at,
      lease_expires_at,
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
  { sqlTools }: WriteDb,
  { runId }: { runId: string },
): Promise<boolean> {
  const renewed = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE openlibrary_etl_state
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

/** Marks the claimed dump as fully applied and drops the lease. */
export async function completeEtlRun(
  { sqlTools }: WriteDb,
  { dumpDate, runId }: { dumpDate: string; runId: string },
): Promise<boolean> {
  const released = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE openlibrary_etl_state
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
  { sqlTools }: WriteDb,
  { runId, error }: { runId: string; error: unknown },
): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const released = await sqlTools.any(z.object({ id: z.boolean() }))`
    UPDATE openlibrary_etl_state
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
