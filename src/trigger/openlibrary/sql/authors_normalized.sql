CREATE OR REPLACE TABLE `${project}.${dataset}.authors_normalized`
CLUSTER BY author_olid, name AS
SELECT
  REGEXP_REPLACE(JSON_VALUE(data, '$.key'), r'^/authors/', '') AS author_olid,
  SAFE_CAST(revision AS INT64) AS revision,
  last_modified AS last_modified_raw,

  JSON_VALUE(data, '$.name') AS name,
  SAFE_CAST(JSON_VALUE(data, '$.eastern_order') AS BOOL) AS eastern_order,
  JSON_VALUE(data, '$.personal_name') AS personal_name,
  JSON_VALUE(data, '$.enumeration') AS enumeration,
  JSON_VALUE(data, '$.title') AS title,

  IFNULL(JSON_VALUE_ARRAY(data, '$.alternate_names'), CAST([] AS ARRAY<STRING>)) AS alternate_names,
  IFNULL(JSON_VALUE_ARRAY(data, '$.uris'), CAST([] AS ARRAY<STRING>)) AS uris,

  CASE
    WHEN JSON_TYPE(JSON_QUERY(data, '$.bio')) = 'string' THEN JSON_VALUE(data, '$.bio')
    WHEN JSON_TYPE(JSON_QUERY(data, '$.bio')) = 'object' THEN JSON_VALUE(data, '$.bio.value')
  END AS bio,

  JSON_VALUE(data, '$.location') AS location,
  JSON_VALUE(data, '$.birth_date') AS birth_date,
  JSON_VALUE(data, '$.death_date') AS death_date,
  JSON_VALUE(data, '$.date') AS date,
  JSON_VALUE(data, '$.wikipedia') AS wikipedia,

  IFNULL(JSON_QUERY_ARRAY(data, '$.links'), CAST([] AS ARRAY<JSON>)) AS links_json
FROM `${project}.${dataset}.raw`
WHERE type = '/type/author';
