-- Full export: every row, no checkpoint join and no `change_type`.
--
-- This is a genuinely different query from the delta export, producing a
-- different column set, which is why the export mode has to be decided before
-- BigQuery runs rather than inferred afterwards from what landed in GCS.
--
-- Feeds Path B (build a new table and swap it in). It must never feed the delta
-- path, which would grind ~30M rows through individual upserts.
EXPORT DATA OPTIONS (
  uri = '${exportUri}',
  format = 'PARQUET',
  compression = 'SNAPPY',
  overwrite = true
) AS
SELECT
  ${currentColumns}
FROM `${project}.${dataset}.works_for_postgres`;
