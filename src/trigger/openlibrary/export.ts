import checkpointEnsureSql from "./sql/checkpoint_ensure.sql?raw";
import checkpointAdvanceSql from "./sql/checkpoint_advance.sql?raw";
import deltaStatsSql from "./sql/delta_stats.sql?raw";
import exportDeltaSql from "./sql/export_delta.sql?raw";
import exportFullSql from "./sql/export_full.sql?raw";
import { BQClient } from "./bq";
import { renderSql } from "./queries";
import {
  columnList,
  currentRowsWithHash,
  qualifiedColumnList,
} from "./columns";

export const DATASET = "openlibrary";
export const CURRENT_TABLE = "works_for_postgres";

/**
 * Named `_hashes` rather than reusing `works_for_postgres_synced` so the shape
 * change from full-copy to `(olid, row_hash)` is explicit. The old full-copy
 * table is dropped by the ETL cleanup.
 */
export const SYNCED_TABLE = "works_for_postgres_synced_hashes";

/**
 * Above this share of the catalogue changing, the run stops instead of loading.
 *
 * A starting guess, not a measurement — see the open question in
 * docs/openlibrary-etl.md. Deliberately low: crossing it is not an error, it is
 * a request for a human to look.
 */
export const DELTA_RATIO_THRESHOLD = 0.1;

export type DeltaStats = {
  currentRowCount: number;
  syncedRowCount: number;
  upsertCount: number;
  deleteCount: number;
  /** Share of the *incoming* catalogue this run would touch. */
  changeRatio: number;
};

export type ExportMode = "delta" | "full";

/**
 * Where a single run's Parquet shards live.
 *
 * Unique per run and never reused, so a retry cannot read a previous run's
 * shards and the loader's file list is unambiguous. This is what makes the old
 * pre-run `clearDirectory()` unnecessary — retention is the bucket lifecycle
 * rule on `exports/`, which sweeps the whole tree by age.
 */
export function exportPrefixFor(dumpDate: string, exportId: string) {
  return `exports/works-for-postgres/${dumpDate}/${exportId}/`;
}

function qualified(bq: BQClient, table: string) {
  return `${bq.projectId}.${DATASET}.${table}`;
}

function baseVariables(bq: BQClient) {
  return {
    project: bq.projectId,
    dataset: DATASET,
    syncedTable: SYNCED_TABLE,
    currentRowsWithHash: currentRowsWithHash(qualified(bq, CURRENT_TABLE)),
  };
}

export async function ensureCheckpointTable(bq: BQClient) {
  const job = await bq.createQueryJob(
    renderSql(checkpointEnsureSql, baseVariables(bq)),
  );
  await job.promise();
}

/**
 * Sizes the delta. Run before exporting, because the export mode cannot be
 * changed after the fact.
 */
export async function measureDelta(bq: BQClient): Promise<DeltaStats> {
  const [row] = await bq.query<{
    current_row_count: unknown;
    synced_row_count: unknown;
    upsert_count: unknown;
    delete_count: unknown;
  }>(renderSql(deltaStatsSql, baseVariables(bq)));

  if (!row) {
    throw new Error("Delta stats query returned no rows");
  }

  const currentRowCount = Number(row.current_row_count ?? 0);
  const syncedRowCount = Number(row.synced_row_count ?? 0);
  const upsertCount = Number(row.upsert_count ?? 0);
  const deleteCount = Number(row.delete_count ?? 0);

  return {
    currentRowCount,
    syncedRowCount,
    upsertCount,
    deleteCount,
    changeRatio: (upsertCount + deleteCount) / Math.max(currentRowCount, 1),
  };
}

export async function exportToParquet(
  bq: BQClient,
  {
    mode,
    bucket,
    prefix,
  }: { mode: ExportMode; bucket: string; prefix: string },
) {
  const exportUri = `gs://${bucket}/${prefix}part-*.parquet`;
  const sql =
    mode === "full"
      ? renderSql(exportFullSql, {
          ...baseVariables(bq),
          exportUri,
          currentColumns: columnList("  "),
        })
      : renderSql(exportDeltaSql, {
          ...baseVariables(bq),
          exportUri,
          qualifiedCurrentColumns: qualifiedColumnList(
            "current_rows",
            "      ",
          ),
        });

  const job = await bq.createQueryJob(sql);
  await job.promise();
  return { exportUri };
}

/**
 * Moves the checkpoint to match what Postgres now holds.
 *
 * Strictly after the Postgres commit. If this ran first and the load then
 * failed, the next run would diff against a checkpoint claiming rows Postgres
 * never received and would never ship them.
 */
export async function advanceCheckpoint(bq: BQClient) {
  const job = await bq.createQueryJob(
    renderSql(checkpointAdvanceSql, baseVariables(bq)),
  );
  await job.promise();
}
