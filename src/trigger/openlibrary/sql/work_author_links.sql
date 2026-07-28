CREATE OR REPLACE TABLE `${project}.${dataset}.work_author_links`
CLUSTER BY author_olid, work_olid AS
SELECT DISTINCT
  w.work_olid,
  author_id AS author_olid
FROM `${project}.${dataset}.works_normalized` w,
UNNEST(IFNULL(w.author_ids, CAST([] AS ARRAY<STRING>))) AS author_id
WHERE author_id IS NOT NULL;
