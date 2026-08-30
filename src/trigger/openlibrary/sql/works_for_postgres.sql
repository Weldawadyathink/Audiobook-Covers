-- Narrow projection of works_search that mirrors the Postgres `openlibrary_work`
-- table. Every ARRAY column is sorted so that the row hash computed in
-- the ETL delta export is stable across dumps — BigQuery's ARRAY_AGG does not
-- guarantee ordering, so an unsorted array would produce spurious deltas.
CREATE OR REPLACE TABLE `${project}.${dataset}.works_for_postgres`
CLUSTER BY olid, title AS
SELECT
  olid,
  title,
  subtitle,
  ARRAY(
    SELECT name
    FROM UNNEST(IFNULL(author_names, CAST([] AS ARRAY<STRING>))) AS name
    ORDER BY name
  ) AS author_names,
  ARRAY(
    SELECT alias
    FROM UNNEST(IFNULL(author_alternate_names, CAST([] AS ARRAY<STRING>))) AS alias
    ORDER BY alias
  ) AS author_aliases,
  ARRAY(
    SELECT alias
    FROM UNNEST(IFNULL(title_aliases, CAST([] AS ARRAY<STRING>))) AS alias
    ORDER BY alias
  ) AS title_aliases,
  ARRAY(
    SELECT subject
    FROM UNNEST(IFNULL(subjects, CAST([] AS ARRAY<STRING>))) AS subject
    ORDER BY subject
  ) AS subjects,
  description,
  COALESCE(
    first_edition_publish_year,
    SAFE_CAST(REGEXP_EXTRACT(first_publish_date, r'\d{4}') AS INT64)
  ) AS first_publish_year,
  edition_count,
  canonical_score
FROM `${project}.${dataset}.works_search`
WHERE title IS NOT NULL;
