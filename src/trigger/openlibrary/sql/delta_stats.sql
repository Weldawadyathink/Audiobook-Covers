-- Sizes the delta before anything is exported, so the run can pick a load path
-- and refuse to proceed on a result that looks like a truncated dump.
--
-- One FULL OUTER JOIN rather than four separate counting queries: `current_rows`
-- hashes every column of every row, and paying for that scan once instead of
-- four times is the difference between a trivial and a noticeable BigQuery bill.
WITH
  current_rows AS (
    ${currentRowsWithHash}
  ),
  synced_rows AS (
    SELECT olid, row_hash FROM `${project}.${dataset}.${syncedTable}`
  )
SELECT
  COUNTIF(current_rows.olid IS NOT NULL) AS current_row_count,
  COUNTIF(synced_rows.olid IS NOT NULL) AS synced_row_count,
  COUNTIF(
    current_rows.olid IS NOT NULL
    AND (
      synced_rows.olid IS NULL
      OR current_rows.row_hash != synced_rows.row_hash
    )
  ) AS upsert_count,
  COUNTIF(current_rows.olid IS NULL) AS delete_count
FROM current_rows
FULL OUTER JOIN synced_rows
  ON current_rows.olid = synced_rows.olid;
