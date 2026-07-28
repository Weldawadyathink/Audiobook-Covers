import { importedColumns, importedColumnNames } from "./columns";

/**
 * Every Postgres statement the load paths issue, as pure string builders.
 *
 * Kept free of `env`, trigger.dev and database clients so the statements can be
 * built and executed against a throwaway Postgres in a test without dragging the
 * whole ETL in. The SQL here is the part most worth checking: `LIKE … INCLUDING`
 * semantics, data-modifying CTEs and a two-stage table swap all fail in ways
 * that only show up at runtime.
 */

export const TARGET_TABLE = "openlibrary_work";
export const DELTA_STAGE_TABLE = "openlibrary_work_delta_stage";
export const KEEP_TABLE = "openlibrary_work_keep";
export const NEW_TABLE = "openlibrary_work_new";
export const OLD_TABLE = "openlibrary_work_old";

export const TITLE_INDEX = "idx_openlibrary_work_title_search";
export const AUTHOR_INDEX = "idx_openlibrary_work_author_names_search";

export function qualify(schemaName: string, table: string) {
  return `"${schemaName}"."${table}"`;
}

const columns = importedColumnNames.join(",\n          ");

const conflictAssignments = importedColumnNames
  .filter((name) => name !== "olid")
  .map((name) => `            ${name} = EXCLUDED.${name}`)
  .join(",\n");

/**
 * Landing table for a delta export.
 *
 * Permanent, not `TEMP`: DuckDB's `ATTACH` opens its own libpq session, so a
 * temp table created by the merge connection is invisible to the loader and vice
 * versa. `UNLOGGED` is correct here and only here — rebuilt from the export
 * every run, never swapped into production, so losing it on failover costs
 * nothing. (A table that *is* swapped in must be `LOGGED` from the start:
 * flipping `UNLOGGED` → `LOGGED` rewrites the whole table.)
 *
 * All columns nullable, unlike `openlibrary_work`: delete rows carry only
 * `olid`.
 */
export function deltaStageDdl(schemaName: string) {
  const columnDefs = importedColumns
    .map((column) => `  ${column.name} ${column.stageType}`)
    .join(",\n");
  return `
CREATE UNLOGGED TABLE ${qualify(schemaName, DELTA_STAGE_TABLE)} (
  change_type text NOT NULL,
${columnDefs}
)`.trim();
}

/**
 * The merge walks `(change_type, olid)` with a keyset cursor. Without this index
 * every chunk is a full scan and sort of the staging table.
 */
export function deltaStageIndexDdl(schemaName: string) {
  return `
CREATE INDEX "${DELTA_STAGE_TABLE}_change_olid_idx"
ON ${qualify(schemaName, DELTA_STAGE_TABLE)} (change_type, olid)`.trim();
}

/**
 * One committed chunk of deletes. `$1` is the keyset cursor, `$2` the chunk size.
 *
 * The cursor advances from `chunk`, not from `deleted`: a staged delete whose
 * `olid` is already absent from the target returns no row, and driving the
 * cursor off `RETURNING` would stall on it forever.
 */
export function deleteChunkSql(schemaName: string) {
  return `
WITH chunk AS (
  SELECT olid
  FROM ${qualify(schemaName, DELTA_STAGE_TABLE)}
  WHERE change_type = 'delete' AND olid > $1
  ORDER BY olid
  LIMIT $2
),
deleted AS (
  DELETE FROM ${qualify(schemaName, TARGET_TABLE)} AS target
  USING chunk
  WHERE target.olid = chunk.olid
  RETURNING target.olid
)
SELECT
  max(chunk.olid) AS next_cursor,
  count(*)::int AS chunk_size,
  (SELECT count(*)::int FROM deleted) AS applied_count
FROM chunk`.trim();
}

/**
 * One committed chunk of upserts. `$1` is the keyset cursor, `$2` the chunk size.
 *
 * Each call is its own implicit transaction. Never one long transaction: a
 * multi-hour transaction pins the xmin horizon and blocks autovacuum across the
 * whole database, not just this table.
 *
 * No `IS DISTINCT FROM` guard — BigQuery already diffed on `row_hash`, so every
 * staged row is known to differ, and re-checking only made the applied count
 * under-report.
 */
export function upsertChunkSql(schemaName: string) {
  return `
WITH chunk AS (
  SELECT *
  FROM ${qualify(schemaName, DELTA_STAGE_TABLE)}
  WHERE change_type = 'upsert' AND olid > $1
  ORDER BY olid
  LIMIT $2
),
upserted AS (
  INSERT INTO ${qualify(schemaName, TARGET_TABLE)} (
          ${columns}
  )
  SELECT
          ${columns}
  FROM chunk
  -- Sorted so btree and GIN writes stay near-sequential instead of touching a
  -- random leaf page per row.
  ORDER BY olid
  ON CONFLICT (olid) DO UPDATE SET
${conflictAssignments}
  RETURNING olid
)
SELECT
  max(chunk.olid) AS next_cursor,
  count(*)::int AS chunk_size,
  (SELECT count(*)::int FROM upserted) AS applied_count
FROM chunk`.trim();
}

/**
 * The small table holding only what the website can actually reach.
 *
 * `LIKE … INCLUDING ALL`, never `CREATE TABLE AS SELECT`. CTAS keeps column
 * types and nothing else — no `NOT NULL`, no defaults, no primary key, no
 * indexes, no check constraints — so the table swapped into production would
 * silently lose every constraint the schema declares. `INCLUDING ALL` brings the
 * indexes too, which is fine at this size.
 */
export function keepTableDdl(schemaName: string) {
  return `CREATE TABLE ${qualify(schemaName, KEEP_TABLE)} (LIKE ${qualify(
    schemaName,
    TARGET_TABLE,
  )} INCLUDING ALL)`;
}

export function keepTableInsertSql(schemaName: string) {
  return `
INSERT INTO ${qualify(schemaName, KEEP_TABLE)}
SELECT * FROM ${qualify(schemaName, TARGET_TABLE)}
WHERE olid IN (
  SELECT DISTINCT openlibrary_work_id
  FROM ${qualify(schemaName, "image")}
  WHERE openlibrary_work_id IS NOT NULL
)`.trim();
}

/**
 * The full rebuild target.
 *
 * Everything EXCEPT indexes, so 30M rows land in a heap with no index
 * maintenance and the indexes are built once, sequentially, afterwards. In
 * Postgres the primary key arrives via `INCLUDING INDEXES`, so omitting that
 * also omits the PK — which is what we want; it is added after the load.
 *
 * `LOGGED` (the default) deliberately: building `UNLOGGED` and flipping it later
 * rewrites the whole table, needing exactly the 2x headroom this sequence exists
 * to avoid.
 */
export function newTableDdl(schemaName: string) {
  return `
CREATE TABLE ${qualify(schemaName, NEW_TABLE)} (
  LIKE ${qualify(schemaName, TARGET_TABLE)}
  INCLUDING DEFAULTS
  INCLUDING CONSTRAINTS
  INCLUDING GENERATED
  INCLUDING COMMENTS
)`.trim();
}

/**
 * Renames `source` into place, parking the current table under `OLD_TABLE`.
 *
 * `lock_timeout` so the `ACCESS EXCLUSIVE` grab fails fast instead of queueing
 * behind a long reader while blocking every other query on the table.
 *
 * Returned as separate statements so the caller can run them inside one
 * transaction — the two renames must be atomic or there is a moment with no
 * `openlibrary_work` at all.
 */
export function swapStatements(schemaName: string, sourceTable: string) {
  return [
    `SET LOCAL lock_timeout = '10s'`,
    `ALTER TABLE ${qualify(schemaName, TARGET_TABLE)} RENAME TO "${OLD_TABLE}"`,
    `ALTER TABLE ${qualify(schemaName, sourceTable)} RENAME TO "${TARGET_TABLE}"`,
  ];
}

export function dropOldTableSql(schemaName: string) {
  return `DROP TABLE ${qualify(schemaName, OLD_TABLE)}`;
}

/**
 * The three index builds for a rebuilt table, in the order they should run.
 *
 * The primary key is named explicitly: the auto-generated name would be
 * `openlibrary_work_new_pkey` and would survive the rename, drifting from what
 * `db/schema.ts` declares.
 *
 * **These must run only after the old table has been dropped.** Index names are
 * unique per schema, renaming a table does *not* rename its indexes, so the
 * outgoing table keeps holding `openlibrary_work_pkey` until it is dropped —
 * Path B's shrink-swap-drop frees the name just in time. Building indexes
 * earlier to shorten the reduced-catalogue window looks tempting and fails with
 * a bare "relation already exists", after the 30M-row load. There is a test
 * pinning this.
 *
 * The GIN expressions must match `db/schema.ts` **verbatim**. Postgres only uses
 * an expression index when the query expression matches exactly, so a difference
 * here does not fail — it silently degrades search to a sequential scan over
 * ~30M rows.
 */
export function rebuildIndexCommands(schemaName: string) {
  const table = qualify(schemaName, NEW_TABLE);
  return [
    {
      jobName: "openlibrary-etl-pkey",
      label: "primary key",
      command: `ALTER TABLE ${table} ADD CONSTRAINT "${TARGET_TABLE}_pkey" PRIMARY KEY (olid)`,
      existsSql: constraintExistsSql(schemaName, `${TARGET_TABLE}_pkey`),
    },
    {
      jobName: "openlibrary-etl-title-gin",
      label: "title GIN index",
      command:
        `CREATE INDEX "${TITLE_INDEX}" ON ${table} ` +
        `USING gin (to_tsvector('simple'::regconfig, COALESCE(title, '')))`,
      existsSql: indexExistsSql(schemaName, TITLE_INDEX),
    },
    {
      jobName: "openlibrary-etl-author-gin",
      label: "author names GIN index",
      command:
        `CREATE INDEX "${AUTHOR_INDEX}" ON ${table} ` +
        `USING gin (to_tsvector('simple'::regconfig, immutable_array_to_string(author_names, ' ')))`,
      existsSql: indexExistsSql(schemaName, AUTHOR_INDEX),
    },
  ];
}

/**
 * Whether a named constraint exists on the rebuild target.
 *
 * `to_regclass` rather than `::regclass`: the cast throws when the relation is
 * absent, and this runs on a polling loop where an exception is far worse than
 * `false`. A missing relation yields NULL, and `conrelid = NULL` is never true.
 *
 * A non-`CONCURRENTLY` build that fails rolls its catalogue entry back with the
 * aborted transaction, so existence here genuinely implies success.
 */
export function constraintExistsSql(
  schemaName: string,
  constraintName: string,
) {
  return `
SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = to_regclass('"${schemaName}"."${NEW_TABLE}"')
    AND conname = '${constraintName}'
) AS present`.trim();
}

/**
 * Whether a named index exists on the rebuild target *and is valid*.
 *
 * `indisvalid` is belt-and-braces for a non-concurrent build, which cannot leave
 * an invalid index behind — but an invalid index is exactly the thing that would
 * be silently ignored by the planner after being swapped into production.
 */
export function indexExistsSql(schemaName: string, indexName: string) {
  return `
SELECT EXISTS (
  SELECT 1
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('"${schemaName}"."${indexName}"')
    AND i.indrelid = to_regclass('"${schemaName}"."${NEW_TABLE}"')
    AND i.indisvalid
) AS present`.trim();
}

/**
 * The DuckDB statement that moves one wave of Parquet shards into Postgres.
 *
 * Explicit, by-name projection rather than `SELECT *`: Parquet column order is
 * whatever BigQuery emitted, and a positional mismatch between two text columns
 * would load silently and wrongly.
 */
export function duckdbInsertSql({
  pgAlias,
  schemaName,
  targetTable,
  includeChangeType,
  uriListLiteral,
}: {
  pgAlias: string;
  schemaName: string;
  targetTable: string;
  includeChangeType: boolean;
  uriListLiteral: string;
}) {
  const targetColumns = [
    ...(includeChangeType ? ["change_type"] : []),
    ...importedColumnNames,
  ].join(", ");
  const sourceColumns = [
    ...(includeChangeType ? ["change_type"] : []),
    ...importedColumns.map((column) => column.duckdbExpr),
  ].join(",\n  ");

  return `
INSERT INTO ${pgAlias}."${schemaName}"."${targetTable}" (${targetColumns})
SELECT
  ${sourceColumns}
FROM read_parquet(${uriListLiteral})`.trim();
}
