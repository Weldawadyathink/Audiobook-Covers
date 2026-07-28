CREATE OR REPLACE TABLE `${project}.${dataset}.works_normalized`
CLUSTER BY work_olid, title AS
SELECT
  REGEXP_REPLACE(JSON_VALUE(data, '$.key'), r'^/works/', '') AS work_olid,
  SAFE_CAST(revision AS INT64) AS revision,
  last_modified AS last_modified_raw,

  JSON_VALUE(data, '$.title') AS title,
  JSON_VALUE(data, '$.subtitle') AS subtitle,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(author_obj, '$.author.key'), r'^/authors/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.authors'), CAST([] AS ARRAY<JSON>))) AS author_obj
    WHERE JSON_VALUE(author_obj, '$.author.key') IS NOT NULL
  ) AS author_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.authors'), CAST([] AS ARRAY<JSON>)) AS authors_json,

  IFNULL(JSON_QUERY_ARRAY(data, '$.translated_titles'), CAST([] AS ARRAY<JSON>)) AS translated_titles_json,

  IFNULL(JSON_VALUE_ARRAY(data, '$.subjects'), CAST([] AS ARRAY<STRING>)) AS subjects,
  IFNULL(JSON_VALUE_ARRAY(data, '$.subject_places'), CAST([] AS ARRAY<STRING>)) AS subject_places,
  IFNULL(JSON_VALUE_ARRAY(data, '$.subject_times'), CAST([] AS ARRAY<STRING>)) AS subject_times,
  IFNULL(JSON_VALUE_ARRAY(data, '$.subject_people'), CAST([] AS ARRAY<STRING>)) AS subject_people,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.description')) = 'string' THEN JSON_VALUE(data, '$.description')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.description')) = 'object' THEN JSON_VALUE(data, '$.description.value')
  END AS description,

  IFNULL(JSON_VALUE_ARRAY(data, '$.dewey_number'), CAST([] AS ARRAY<STRING>)) AS dewey_number,
  IFNULL(JSON_VALUE_ARRAY(data, '$.lc_classifications'), CAST([] AS ARRAY<STRING>)) AS lc_classifications,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.first_sentence')) = 'string' THEN JSON_VALUE(data, '$.first_sentence')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.first_sentence')) = 'object' THEN JSON_VALUE(data, '$.first_sentence.value')
  END AS first_sentence,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(lang_obj, '$.key'), r'^/languages/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.original_languages'), CAST([] AS ARRAY<JSON>))) AS lang_obj
    WHERE JSON_VALUE(lang_obj, '$.key') IS NOT NULL
  ) AS original_language_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.original_languages'), CAST([] AS ARRAY<JSON>)) AS original_languages_json,

  IFNULL(JSON_VALUE_ARRAY(data, '$.other_titles'), CAST([] AS ARRAY<STRING>)) AS other_titles,
  JSON_VALUE(data, '$.first_publish_date') AS first_publish_date,

  IFNULL(JSON_QUERY_ARRAY(data, '$.links'), CAST([] AS ARRAY<JSON>)) AS links_json,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.notes')) = 'string' THEN JSON_VALUE(data, '$.notes')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.notes')) = 'object' THEN JSON_VALUE(data, '$.notes.value')
  END AS notes,

  REGEXP_REPLACE(JSON_VALUE(data, '$.cover_edition.key'), r'^/books/', '') AS cover_edition_id,

  ARRAY(
    SELECT SAFE_CAST(x AS INT64)
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.covers'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE SAFE_CAST(x AS INT64) IS NOT NULL
  ) AS covers
FROM `${project}.${dataset}.raw`
WHERE type = '/type/work';
