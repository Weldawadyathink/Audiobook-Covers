-- Advances the checkpoint to whatever Postgres now holds. Only ever run after
-- the Postgres write has committed: the checkpoint moving ahead of the data is
-- silent, permanent drift, because the next run diffs against it and sees
-- nothing to do.
CREATE OR REPLACE TABLE `${project}.${dataset}.${syncedTable}`
CLUSTER BY olid AS
SELECT olid, row_hash
FROM (
  ${currentRowsWithHash}
);
