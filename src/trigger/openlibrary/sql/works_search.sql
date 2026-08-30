CREATE OR REPLACE TABLE `${project}.${dataset}.works_search`
CLUSTER BY olid, title AS
WITH work_translated_titles AS (
  SELECT
    w.work_olid,
    ARRAY_AGG(
      DISTINCT COALESCE(
        JSON_VALUE(tt, '$.title'),
        JSON_VALUE(tt, '$.value')
      )
      IGNORE NULLS
    ) AS translated_titles
    FROM `${project}.${dataset}.works_normalized` w
    LEFT JOIN UNNEST(IFNULL(w.translated_titles_json, CAST([] AS ARRAY<JSON>))) AS tt
    GROUP BY w.work_olid
),
work_title_aliases AS (
  SELECT
    w.work_olid,
    ARRAY(
      SELECT DISTINCT alias
      FROM UNNEST(ARRAY_CONCAT(
        [w.title],
        IF(w.subtitle IS NULL, CAST([] AS ARRAY<STRING>), [w.subtitle]),
        IFNULL(w.other_titles, CAST([] AS ARRAY<STRING>)),
        IFNULL(wtt.translated_titles, CAST([] AS ARRAY<STRING>)),
        IFNULL(ea.edition_titles, CAST([] AS ARRAY<STRING>)),
        IFNULL(ea.edition_subtitles, CAST([] AS ARRAY<STRING>))
      )) AS alias
      WHERE alias IS NOT NULL AND alias != ''
    ) AS title_aliases
  FROM `${project}.${dataset}.works_normalized` w
  LEFT JOIN work_translated_titles wtt
    ON wtt.work_olid = w.work_olid
  LEFT JOIN `${project}.${dataset}.edition_aggregates` ea
    ON ea.work_olid = w.work_olid
),
search_source AS (
  SELECT
    w.work_olid AS olid,
    w.title,
    w.subtitle,
    w.author_ids,
    IFNULL(wa.author_names, CAST([] AS ARRAY<STRING>)) AS author_names,
    IFNULL(wa.author_alternate_names, CAST([] AS ARRAY<STRING>)) AS author_alternate_names,
    IFNULL(w.other_titles, CAST([] AS ARRAY<STRING>)) AS other_titles,
    IFNULL(wtt.translated_titles, CAST([] AS ARRAY<STRING>)) AS translated_titles,
    IFNULL(wta.title_aliases, CAST([] AS ARRAY<STRING>)) AS title_aliases,
    IFNULL(w.subjects, CAST([] AS ARRAY<STRING>)) AS subjects,
    IFNULL(w.subject_places, CAST([] AS ARRAY<STRING>)) AS subject_places,
    IFNULL(w.subject_times, CAST([] AS ARRAY<STRING>)) AS subject_times,
    IFNULL(w.subject_people, CAST([] AS ARRAY<STRING>)) AS subject_people,
    w.description,
    w.first_sentence,
    w.notes,
    w.first_publish_date,
    w.cover_edition_id,
    IFNULL(w.covers, CAST([] AS ARRAY<INT64>)) AS covers,
    IFNULL(ea.edition_count, 0) AS edition_count,
    IFNULL(ea.edition_titles, CAST([] AS ARRAY<STRING>)) AS edition_titles,
    IFNULL(ea.edition_subtitles, CAST([] AS ARRAY<STRING>)) AS edition_subtitles,
    ea.first_edition_publish_year,
    ea.latest_edition_publish_year,
    IFNULL(ea.publishers, CAST([] AS ARRAY<STRING>)) AS publishers,
    IFNULL(ea.publish_places, CAST([] AS ARRAY<STRING>)) AS publish_places,
    IFNULL(ea.language_ids, CAST([] AS ARRAY<STRING>)) AS language_ids,
    IFNULL(ea.edition_author_ids, CAST([] AS ARRAY<STRING>)) AS edition_author_ids,
    IFNULL(ea.edition_publish_years, CAST([] AS ARRAY<INT64>)) AS edition_publish_years,
    IFNULL(ea.by_statements, CAST([] AS ARRAY<STRING>)) AS by_statements
  FROM `${project}.${dataset}.works_normalized` w
  LEFT JOIN `${project}.${dataset}.work_author_aggregates` wa
    ON wa.work_olid = w.work_olid
  LEFT JOIN work_translated_titles wtt
    ON wtt.work_olid = w.work_olid
  LEFT JOIN work_title_aliases wta
    ON wta.work_olid = w.work_olid
  LEFT JOIN `${project}.${dataset}.edition_aggregates` ea
    ON ea.work_olid = w.work_olid
)
SELECT
  s.olid,
  s.title,
  s.subtitle,
  s.author_ids,
  s.author_names,
  s.author_alternate_names,
  ARRAY_TO_STRING(
    ARRAY(
      SELECT DISTINCT word
      FROM UNNEST(
        ARRAY_CONCAT(
          IFNULL(s.author_names, CAST([] AS ARRAY<STRING>)),
          IFNULL(s.author_alternate_names, CAST([] AS ARRAY<STRING>))
        )
      ) AS name_part,
      UNNEST(
        SPLIT(
          REGEXP_REPLACE(LOWER(name_part), r'[^[:alnum:]\s]+', ' '),
          ' '
        )
      ) AS word
      WHERE word != ''
    ),
    ' '
  ) AS author_search_text,
  s.other_titles,
  s.translated_titles,
  s.title_aliases,
  ARRAY_TO_STRING(
    ARRAY(
      SELECT DISTINCT word
      FROM UNNEST(s.title_aliases) AS alias,
      UNNEST(
        SPLIT(
          REGEXP_REPLACE(LOWER(alias), r'[^[:alnum:]\s]+', ' '),
          ' '
        )
      ) AS word
      WHERE word != ''
    ),
    ' '
  ) AS title_search_text,
  s.subjects,
  s.subject_places,
  s.subject_times,
  s.subject_people,
  s.description,
  s.first_sentence,
  s.notes,
  s.first_publish_date,
  s.cover_edition_id,
  s.covers,
  s.edition_count,
  s.edition_titles,
  s.edition_subtitles,
  s.first_edition_publish_year,
  s.latest_edition_publish_year,
  s.publishers,
  s.publish_places,
  s.language_ids,
  s.edition_author_ids,
  s.edition_publish_years,
  s.by_statements,
  (
    LEAST(s.edition_count, 250) * 4 +
    CASE WHEN ARRAY_LENGTH(s.author_names) > 0 THEN 60 ELSE 0 END +
    CASE WHEN s.description IS NOT NULL THEN 30 ELSE 0 END +
    CASE WHEN s.first_publish_date IS NOT NULL THEN 15 ELSE 0 END +
    CASE WHEN ARRAY_LENGTH(s.covers) > 0 THEN 10 ELSE 0 END +
    CASE WHEN ARRAY_LENGTH(s.edition_titles) > 1 THEN 10 ELSE 0 END
  ) AS canonical_score
FROM search_source s;
