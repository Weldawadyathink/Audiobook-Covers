CREATE OR REPLACE TABLE `${project}.${dataset}.work_author_aggregates`
CLUSTER BY work_olid AS
WITH names AS (
  SELECT
    wal.work_olid,
    ARRAY_AGG(DISTINCT a.name IGNORE NULLS) AS author_names
  FROM `${project}.${dataset}.work_author_links` wal
  JOIN `${project}.${dataset}.authors_normalized` a
    ON a.author_olid = wal.author_olid
  GROUP BY wal.work_olid
),
alts AS (
  SELECT
    wal.work_olid,
    ARRAY_AGG(DISTINCT alt IGNORE NULLS) AS author_alternate_names
  FROM `${project}.${dataset}.work_author_links` wal
  JOIN `${project}.${dataset}.authors_normalized` a
    ON a.author_olid = wal.author_olid
  LEFT JOIN UNNEST(IFNULL(a.alternate_names, CAST([] AS ARRAY<STRING>))) AS alt
  GROUP BY wal.work_olid
)
SELECT
  COALESCE(n.work_olid, a.work_olid) AS work_olid,
  IFNULL(n.author_names, CAST([] AS ARRAY<STRING>)) AS author_names,
  IFNULL(a.author_alternate_names, CAST([] AS ARRAY<STRING>)) AS author_alternate_names
FROM names n
FULL OUTER JOIN alts a
  USING (work_olid);
