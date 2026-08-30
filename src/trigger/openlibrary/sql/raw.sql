-- Loads the full OpenLibrary dump (tab separated, no quoting) into a single
-- clustered table. `data` is a JSON column so downstream queries can use
-- JSON_VALUE / JSON_QUERY without re-parsing strings.
LOAD DATA OVERWRITE `${project}.${dataset}.raw`
(
  type STRING,
  key STRING,
  revision STRING,
  last_modified STRING,
  data JSON
)
CLUSTER BY type
FROM FILES (
  format = 'CSV',
  uris = ['gs://${bucket}/${csvKey}'],
  field_delimiter = '\t',
  quote = '',
  skip_leading_rows = 0
);
