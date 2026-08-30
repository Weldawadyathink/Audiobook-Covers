-- Checkpoint of what Postgres already has, as `(olid, row_hash)` only.
--
-- The delta query reads the synced side for exactly two things: `olid` (to find
-- deletes) and `row_hash` (to find changes). Carrying the other columns made
-- this a full second copy of works_for_postgres that was rescanned every run for
-- no benefit.
CREATE TABLE IF NOT EXISTS `${project}.${dataset}.${syncedTable}` (
  olid STRING,
  row_hash STRING
)
CLUSTER BY olid;
