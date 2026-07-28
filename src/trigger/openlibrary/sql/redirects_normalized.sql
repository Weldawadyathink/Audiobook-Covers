CREATE OR REPLACE TABLE `${project}.${dataset}.redirects_normalized` AS
SELECT
  key AS raw_key,
  REGEXP_REPLACE(key, r'^/(works|books|authors)/', '') AS source_olid,
  JSON_VALUE(data, '$.location') AS location_raw,
  REGEXP_REPLACE(JSON_VALUE(data, '$.location'), r'^/(works|books|authors)/', '') AS target_olid,
  SAFE_CAST(revision AS INT64) AS revision,
  last_modified AS last_modified_raw
FROM `${project}.${dataset}.raw`
WHERE type = '/type/redirect';
