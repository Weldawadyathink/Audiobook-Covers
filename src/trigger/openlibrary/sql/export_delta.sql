-- Delta export: only the rows Postgres does not already have in the right shape.
--
-- PARQUET rather than gzipped JSON. Typed and columnar, so arrays survive as
-- arrays and integers as integers; the old JSON path parsed every row three
-- times on the way in (JSON line -> CSV field -> jsonb -> typed columns).
--
-- `uri` points at a prefix unique to this run. BigQuery shards the output into
-- many small files, and a shared prefix meant a retry could read a previous
-- run's leftovers.
EXPORT DATA OPTIONS (
  uri = '${exportUri}',
  format = 'PARQUET',
  compression = 'SNAPPY',
  overwrite = true
) AS
WITH
  current_rows AS (
    ${currentRowsWithHash}
  ),
  synced_rows AS (
    SELECT olid, row_hash FROM `${project}.${dataset}.${syncedTable}`
  ),
  upserts AS (
    SELECT
      'upsert' AS change_type,
      ${qualifiedCurrentColumns}
    FROM current_rows
    LEFT JOIN synced_rows USING (olid)
    WHERE synced_rows.olid IS NULL
       OR current_rows.row_hash != synced_rows.row_hash
  ),
  deletes AS (
    -- Typed NULL placeholders so the two branches union cleanly. The loader
    -- only reads `olid` from delete rows.
    SELECT
      'delete' AS change_type,
      synced_rows.olid,
      CAST(NULL AS STRING) AS title,
      CAST(NULL AS STRING) AS subtitle,
      CAST([] AS ARRAY<STRING>) AS author_names,
      CAST([] AS ARRAY<STRING>) AS author_aliases,
      CAST([] AS ARRAY<STRING>) AS title_aliases,
      CAST([] AS ARRAY<STRING>) AS subjects,
      CAST(NULL AS STRING) AS description,
      CAST(NULL AS INT64) AS first_publish_year,
      CAST(NULL AS INT64) AS edition_count,
      CAST(NULL AS INT64) AS canonical_score
    FROM synced_rows
    LEFT JOIN current_rows USING (olid)
    WHERE current_rows.olid IS NULL
  )
SELECT * FROM upserts
UNION ALL
SELECT * FROM deletes;
