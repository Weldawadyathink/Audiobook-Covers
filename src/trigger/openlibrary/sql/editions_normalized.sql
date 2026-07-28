CREATE OR REPLACE TABLE `${project}.${dataset}.editions_normalized`
CLUSTER BY work_olid, edition_olid, title AS
SELECT
  REGEXP_REPLACE(JSON_VALUE(data, '$.key'), r'^/books/', '') AS edition_olid,
  SAFE_CAST(revision AS INT64) AS revision,
  last_modified AS last_modified_raw,

  JSON_VALUE(data, '$.title') AS title,
  JSON_VALUE(data, '$.title_prefix') AS title_prefix,
  JSON_VALUE(data, '$.subtitle') AS subtitle,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.other_titles'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS other_titles,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(author_obj, '$.key'), r'^/authors/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.authors'), CAST([] AS ARRAY<JSON>))) AS author_obj
    WHERE JSON_VALUE(author_obj, '$.key') IS NOT NULL
  ) AS author_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.authors'), CAST([] AS ARRAY<JSON>)) AS authors_json,

  JSON_VALUE(data, '$.by_statement') AS by_statement,
  JSON_VALUE(data, '$.publish_date') AS publish_date,
  SAFE_CAST(REGEXP_EXTRACT(JSON_VALUE(data, '$.publish_date'), r'(\d{4})') AS INT64) AS publish_year,
  JSON_VALUE(data, '$.copyright_date') AS copyright_date,
  JSON_VALUE(data, '$.edition_name') AS edition_name,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(lang_obj, '$.key'), r'^/languages/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.languages'), CAST([] AS ARRAY<JSON>))) AS lang_obj
    WHERE JSON_VALUE(lang_obj, '$.key') IS NOT NULL
  ) AS language_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.languages'), CAST([] AS ARRAY<JSON>)) AS languages_json,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.description')) = 'string' THEN JSON_VALUE(data, '$.description')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.description')) = 'object' THEN JSON_VALUE(data, '$.description.value')
  END AS description,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.notes')) = 'string' THEN JSON_VALUE(data, '$.notes')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.notes')) = 'object' THEN JSON_VALUE(data, '$.notes.value')
  END AS notes,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.genres'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS genres,

  IFNULL(JSON_QUERY_ARRAY(data, '$.table_of_contents'), CAST([] AS ARRAY<JSON>)) AS table_of_contents_json,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.work_titles'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS work_titles,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.series'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS series,

  JSON_VALUE(data, '$.physical_dimensions') AS physical_dimensions,
  JSON_VALUE(data, '$.physical_format') AS physical_format,
  SAFE_CAST(JSON_VALUE(data, '$.number_of_pages') AS INT64) AS number_of_pages,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.subjects'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS subjects,

  JSON_VALUE(data, '$.pagination') AS pagination,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.lccn'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS lccn,

  JSON_VALUE(data, '$.ocaid') AS ocaid,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.oclc_numbers'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS oclc_numbers,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.isbn_10'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS isbn_10,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.isbn_13'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS isbn_13,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.dewey_decimal_class'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS dewey_decimal_class,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.lc_classifications'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS lc_classifications,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.contributions'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS contributions,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.publish_places'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS publish_places,

  JSON_VALUE(data, '$.publish_country') AS publish_country,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.publishers'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS publishers,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.distributors'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS distributors,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.first_sentence')) = 'string' THEN JSON_VALUE(data, '$.first_sentence')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.first_sentence')) = 'object' THEN JSON_VALUE(data, '$.first_sentence.value')
  END AS first_sentence,

  JSON_VALUE(data, '$.weight') AS weight,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.location'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS locations,

  SAFE_CAST(JSON_VALUE(data, '$.scan_on_demand') AS BOOL) AS scan_on_demand,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(obj, '$.key'), r'^/collections/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.collections'), CAST([] AS ARRAY<JSON>))) AS obj
    WHERE JSON_VALUE(obj, '$.key') IS NOT NULL
  ) AS collection_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.collections'), CAST([] AS ARRAY<JSON>)) AS collections_json,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.uris'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS uris,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.uri_descriptions'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS uri_descriptions,

  JSON_VALUE(data, '$.translation_of') AS translation_of,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(obj, '$.key'), r'^/works/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.works'), CAST([] AS ARRAY<JSON>))) AS obj
    WHERE JSON_VALUE(obj, '$.key') IS NOT NULL
  ) AS work_ids,
  REGEXP_REPLACE(JSON_VALUE(data, '$.works[0].key'), r'^/works/', '') AS work_olid,
  IFNULL(JSON_QUERY_ARRAY(data, '$.works'), CAST([] AS ARRAY<JSON>)) AS works_json,

  ARRAY(
    SELECT x
    FROM UNNEST(IFNULL(JSON_VALUE_ARRAY(data, '$.source_records'), CAST([] AS ARRAY<STRING>))) AS x
    WHERE x IS NOT NULL
  ) AS source_records,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(obj, '$.key'), r'^/languages/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.translated_from'), CAST([] AS ARRAY<JSON>))) AS obj
    WHERE JSON_VALUE(obj, '$.key') IS NOT NULL
  ) AS translated_from_language_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.translated_from'), CAST([] AS ARRAY<JSON>)) AS translated_from_json,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(obj, '$.key'), r'^/scan_record/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.scan_records'), CAST([] AS ARRAY<JSON>))) AS obj
    WHERE JSON_VALUE(obj, '$.key') IS NOT NULL
  ) AS scan_record_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.scan_records'), CAST([] AS ARRAY<JSON>)) AS scan_records_json,

  ARRAY(
    SELECT DISTINCT REGEXP_REPLACE(JSON_VALUE(obj, '$.key'), r'^/volumes/', '')
    FROM UNNEST(IFNULL(JSON_QUERY_ARRAY(data, '$.volumes'), CAST([] AS ARRAY<JSON>))) AS obj
    WHERE JSON_VALUE(obj, '$.key') IS NOT NULL
  ) AS volume_ids,
  IFNULL(JSON_QUERY_ARRAY(data, '$.volumes'), CAST([] AS ARRAY<JSON>)) AS volumes_json,

  JSON_VALUE(data, '$.accompanying_material') AS accompanying_material
FROM `${project}.${dataset}.raw`
WHERE type = '/type/edition';
