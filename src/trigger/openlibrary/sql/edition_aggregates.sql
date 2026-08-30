CREATE OR REPLACE TABLE `${project}.${dataset}.edition_aggregates`
CLUSTER BY work_olid AS
WITH base AS (
  SELECT *
  FROM `${project}.${dataset}.editions_normalized`
  WHERE work_olid IS NOT NULL
),

core AS (
  SELECT
    work_olid,
    COUNT(*) AS edition_count,
    ARRAY_AGG(DISTINCT edition_olid IGNORE NULLS) AS edition_olids,
    ARRAY_AGG(DISTINCT title IGNORE NULLS) AS edition_titles,
    ARRAY_AGG(DISTINCT subtitle IGNORE NULLS) AS edition_subtitles,
    ARRAY_AGG(DISTINCT publish_date IGNORE NULLS) AS edition_publish_dates,
    ARRAY_AGG(DISTINCT publish_year IGNORE NULLS) AS edition_publish_years,
    MIN(publish_year) AS first_edition_publish_year,
    MAX(publish_year) AS latest_edition_publish_year,
    ARRAY_AGG(DISTINCT by_statement IGNORE NULLS) AS by_statements
  FROM base
  GROUP BY work_olid
),

publishers AS (
  SELECT
    work_olid,
    ARRAY_AGG(DISTINCT publisher IGNORE NULLS) AS publishers
  FROM base, UNNEST(IFNULL(publishers, CAST([] AS ARRAY<STRING>))) AS publisher
  GROUP BY work_olid
),

publish_places AS (
  SELECT
    work_olid,
    ARRAY_AGG(DISTINCT publish_place IGNORE NULLS) AS publish_places
  FROM base, UNNEST(IFNULL(publish_places, CAST([] AS ARRAY<STRING>))) AS publish_place
  GROUP BY work_olid
),

language_ids AS (
  SELECT
    work_olid,
    ARRAY_AGG(DISTINCT language_id IGNORE NULLS) AS language_ids
  FROM base, UNNEST(IFNULL(language_ids, CAST([] AS ARRAY<STRING>))) AS language_id
  GROUP BY work_olid
),

edition_author_ids AS (
  SELECT
    work_olid,
    ARRAY_AGG(DISTINCT author_id IGNORE NULLS) AS edition_author_ids
  FROM base, UNNEST(IFNULL(author_ids, CAST([] AS ARRAY<STRING>))) AS author_id
  GROUP BY work_olid
),

isbn_10 AS (
  SELECT
    work_olid,
    ARRAY_AGG(DISTINCT isbn IGNORE NULLS) AS isbn_10
  FROM base, UNNEST(IFNULL(isbn_10, CAST([] AS ARRAY<STRING>))) AS isbn
  GROUP BY work_olid
),

isbn_13 AS (
  SELECT
    work_olid,
    ARRAY_AGG(DISTINCT isbn IGNORE NULLS) AS isbn_13
  FROM base, UNNEST(IFNULL(isbn_13, CAST([] AS ARRAY<STRING>))) AS isbn
  GROUP BY work_olid
)

SELECT
  c.work_olid,
  c.edition_count,
  c.edition_olids,
  c.edition_titles,
  c.edition_subtitles,
  c.edition_publish_dates,
  c.edition_publish_years,
  c.first_edition_publish_year,
  c.latest_edition_publish_year,
  c.by_statements,
  IFNULL(p.publishers, CAST([] AS ARRAY<STRING>)) AS publishers,
  IFNULL(pp.publish_places, CAST([] AS ARRAY<STRING>)) AS publish_places,
  IFNULL(l.language_ids, CAST([] AS ARRAY<STRING>)) AS language_ids,
  IFNULL(a.edition_author_ids, CAST([] AS ARRAY<STRING>)) AS edition_author_ids,
  IFNULL(i10.isbn_10, CAST([] AS ARRAY<STRING>)) AS isbn_10,
  IFNULL(i13.isbn_13, CAST([] AS ARRAY<STRING>)) AS isbn_13
FROM core c
LEFT JOIN publishers p USING (work_olid)
LEFT JOIN publish_places pp USING (work_olid)
LEFT JOIN language_ids l USING (work_olid)
LEFT JOIN edition_author_ids a USING (work_olid)
LEFT JOIN isbn_10 i10 USING (work_olid)
LEFT JOIN isbn_13 i13 USING (work_olid);
