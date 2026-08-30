/**
 * The single definition of what travels from BigQuery to Postgres.
 *
 * Four consumers need to agree on this list, and they used to each hardcode it:
 * the BigQuery export projection, the row hash, the Parquet → Postgres INSERT in
 * the DuckDB loader, and the delta staging table DDL. Adding a column to
 * `openlibrary_work` while missing one of those produced a silent partial load,
 * so they all derive from here instead.
 */

export type ImportedColumn = {
  readonly name: string;
  /**
   * Postgres type for the *delta staging* table. Deliberately all-nullable and
   * constraint-free: delete rows carry NULLs for every non-key column, so this
   * cannot reuse `openlibrary_work`'s types.
   */
  readonly stageType: string;
  /**
   * DuckDB expression producing a value the Postgres column will accept.
   *
   * BigQuery only has INT64, so every integer arrives as a 64-bit value and has
   * to be narrowed to match Postgres `integer` (int4) — the DuckDB postgres
   * extension writes via binary COPY, which does not coerce widths for you.
   * Array columns are COALESCEd because the target columns are `NOT NULL
   * DEFAULT '{}'` and a binary COPY writes an explicit NULL rather than falling
   * back to the default.
   */
  readonly duckdbExpr: string;
};

export const importedColumns = [
  { name: "olid", stageType: "text", duckdbExpr: "olid" },
  { name: "title", stageType: "text", duckdbExpr: "title" },
  { name: "subtitle", stageType: "text", duckdbExpr: "subtitle" },
  {
    name: "author_names",
    stageType: "text[]",
    duckdbExpr: "COALESCE(author_names, []::VARCHAR[])",
  },
  {
    name: "author_aliases",
    stageType: "text[]",
    duckdbExpr: "COALESCE(author_aliases, []::VARCHAR[])",
  },
  {
    name: "title_aliases",
    stageType: "text[]",
    duckdbExpr: "COALESCE(title_aliases, []::VARCHAR[])",
  },
  {
    name: "subjects",
    stageType: "text[]",
    duckdbExpr: "COALESCE(subjects, []::VARCHAR[])",
  },
  { name: "description", stageType: "text", duckdbExpr: "description" },
  {
    name: "first_publish_year",
    stageType: "integer",
    duckdbExpr: "CAST(first_publish_year AS INTEGER)",
  },
  {
    name: "edition_count",
    stageType: "integer",
    duckdbExpr: "CAST(edition_count AS INTEGER)",
  },
  {
    name: "canonical_score",
    stageType: "integer",
    duckdbExpr: "CAST(canonical_score AS INTEGER)",
  },
] as const satisfies readonly ImportedColumn[];

export const importedColumnNames = importedColumns.map(
  (column) => column.name,
) as readonly string[];

/**
 * Columns that feed `row_hash` — everything carried to Postgres except the join
 * key. Changing this list changes every hash, so the next run sees the whole
 * table as modified. That is correct (the payload really did change) but it also
 * means the delta ratio guard will trip and demand an explicit `fullRebuild`,
 * which is the intended outcome when a column is added.
 */
export const hashedColumnNames = importedColumnNames.filter(
  (name) => name !== "olid",
);

/** Column list for a SELECT/INSERT projection. */
export function columnList(indent = ""): string {
  return importedColumnNames.join(`,\n${indent}`);
}

/** Same list, qualified by a table alias. */
export function qualifiedColumnList(alias: string, indent = ""): string {
  return importedColumnNames
    .map((name) => `${alias}.${name}`)
    .join(`,\n${indent}`);
}

/**
 * BigQuery projection of `works_for_postgres` with a stable per-row hash.
 *
 * Built here rather than in a `.sql` file because it is a pure column-list join
 * with no regex escapes to lose — the hazard that forced the rest of the
 * BigQuery SQL out of TypeScript does not apply.
 */
export function currentRowsWithHash(qualifiedTable: string): string {
  return `
    SELECT
      ${columnList("      ")},
      TO_HEX(SHA256(TO_JSON_STRING(STRUCT(
        ${hashedColumnNames.join(",\n        ")}
      )))) AS row_hash
    FROM \`${qualifiedTable}\`
  `.trim();
}

// Postgres statement construction lives in ./load-sql.ts, which imports this
// module. Keeping this file to pure column metadata is what lets the statement
// builders be exercised against a throwaway database without pulling in `env`.
