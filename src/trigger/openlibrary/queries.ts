type QueryDefinition = {
  readonly name: string;
  readonly query: string;
  readonly requires?: readonly string[];
};

type QueryName<TQuery extends QueryDefinition> = TQuery["name"];

type QueryNames<TQueries extends readonly QueryDefinition[]> =
  TQueries[number]["name"];

type QueryByName<
  TQueries extends readonly QueryDefinition[],
  TName extends QueryNames<TQueries>,
> = Extract<TQueries[number], { readonly name: TName }>;

type QueryRequires<TQuery extends QueryDefinition> =
  TQuery["requires"] extends readonly string[]
    ? TQuery["requires"][number]
    : never;

type MissingRequires<
  TQueries extends readonly QueryDefinition[],
  TQuery extends QueryDefinition,
> = Exclude<QueryRequires<TQuery>, QueryNames<TQueries>>;

type SelfRequires<TQuery extends QueryDefinition> = Extract<
  QueryRequires<TQuery>,
  QueryName<TQuery>
>;

type DuplicateNames<
  TQueries extends readonly QueryDefinition[],
  TSeen extends string = never,
> = TQueries extends readonly [
  infer THead extends QueryDefinition,
  ...infer TTail extends readonly QueryDefinition[],
]
  ? QueryName<THead> extends TSeen
    ? QueryName<THead> | DuplicateNames<TTail, TSeen>
    : DuplicateNames<TTail, TSeen | QueryName<THead>>
  : never;

type MissingDependencyErrors<TQueries extends readonly QueryDefinition[]> = {
  [TIndex in keyof TQueries]: TQueries[TIndex] extends infer TQuery extends
    QueryDefinition
    ? MissingRequires<TQueries, TQuery> extends infer TMissing extends string
      ? [TMissing] extends [never]
        ? never
        : `Query "${QueryName<TQuery>}" requires unknown query "${TMissing}"`
      : never
    : never;
}[number];

type SelfDependencyErrors<TQueries extends readonly QueryDefinition[]> = {
  [TIndex in keyof TQueries]: TQueries[TIndex] extends infer TQuery extends
    QueryDefinition
    ? SelfRequires<TQuery> extends infer TSelf extends string
      ? [TSelf] extends [never]
        ? never
        : `Query "${QueryName<TQuery>}" cannot require itself`
      : never
    : never;
}[number];

type DuplicateNameErrors<TQueries extends readonly QueryDefinition[]> =
  DuplicateNames<TQueries> extends infer TDuplicate extends string
    ? [TDuplicate] extends [never]
      ? never
      : `Duplicate query name "${TDuplicate}"`
    : never;

type HasDependencyCycle<
  TQueries extends readonly QueryDefinition[],
  TName extends QueryNames<TQueries>,
  TPath extends string = never,
> = TName extends TPath
  ? true
  : HasDependencyCycleInNames<
      TQueries,
      QueryRequires<QueryByName<TQueries, TName>>,
      TPath | TName
    >;

type HasDependencyCycleInNames<
  TQueries extends readonly QueryDefinition[],
  TNames extends string,
  TPath extends string,
> = [TNames] extends [never]
  ? false
  : Extract<
        {
          [TName in Extract<TNames, QueryNames<TQueries>>]: HasDependencyCycle<
            TQueries,
            TName,
            TPath
          >;
        }[Extract<TNames, QueryNames<TQueries>>],
        true
      > extends never
    ? false
    : true;

type CyclicDependencyErrors<TQueries extends readonly QueryDefinition[]> = {
  [TIndex in keyof TQueries]: TQueries[TIndex] extends infer TQuery extends
    QueryDefinition
    ? HasDependencyCycle<TQueries, QueryName<TQuery>> extends true
      ? `Query "${QueryName<TQuery>}" is part of a dependency cycle`
      : never
    : never;
}[number];

type QueryDependencyErrors<TQueries extends readonly QueryDefinition[]> =
  | DuplicateNameErrors<TQueries>
  | MissingDependencyErrors<TQueries>
  | SelfDependencyErrors<TQueries>
  | CyclicDependencyErrors<TQueries>;

type AssertValidQueries<TQueries extends readonly QueryDefinition[]> =
  QueryDependencyErrors<TQueries> extends never
    ? TQueries
    : TQueries & {
        readonly __query_dependency_errors__: QueryDependencyErrors<TQueries>;
      };

export function defineQueries<
  const TQueries extends readonly QueryDefinition[],
>(queries: AssertValidQueries<TQueries>) {
  return queries;
}

export const queries = defineQueries([
  {
    name: "raw",
    query: `
      LOAD DATA OVERWRITE \`openlibrary.raw\`
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
        uris = ['gs://audiobookcovers/openlibrary/all.csv'],
        field_delimiter = '\t',
        quote = '',
        skip_leading_rows = 0
      );
    `,
  },
  {
    name: "authors_normalized",
    requires: ["raw"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.authors_normalized\`
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
      FROM \`audiobookcovers-487104.openlibrary.raw\`
      WHERE type = '/type/author';
    `,
  },
  {
    name: "editions_normalized",
    requires: ["raw"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.editions_normalized\`
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
      FROM \`audiobookcovers-487104.openlibrary.raw\`
      WHERE type = '/type/edition';

    `,
  },
  {
    name: "redirects_normalized",
    requires: ["raw"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.redirects_normalized\` AS
      SELECT
        key AS raw_key,
        REGEXP_REPLACE(key, r'^/(works|books|authors)/', '') AS source_olid,
        JSON_VALUE(data, '$.location') AS location_raw,
        REGEXP_REPLACE(JSON_VALUE(data, '$.location'), r'^/(works|books|authors)/', '') AS target_olid,
        SAFE_CAST(revision AS INT64) AS revision,
        last_modified AS last_modified_raw
      FROM \`audiobookcovers-487104.openlibrary.raw\`
      WHERE type = '/type/redirect';
    `,
  },
  {
    name: "works_normalized",
    requires: ["raw"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.works_normalized\`
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
      FROM \`audiobookcovers-487104.openlibrary.raw\`
      WHERE type = '/type/work';
    `,
  },
  {
    name: "works_search",
    requires: [
      "works_normalized",
      "edition_aggregates",
      "work_author_aggregates",
    ],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.works_search\`
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
        FROM \`audiobookcovers-487104.openlibrary.works_normalized\` w
        LEFT JOIN UNNEST(IFNULL(w.translated_titles_json, CAST([] AS ARRAY<JSON>))) AS tt
        GROUP BY w.work_olid
      )
      SELECT
        w.work_olid AS olid,
        w.title,
        w.subtitle,
        w.author_ids,
        IFNULL(wa.author_names, CAST([] AS ARRAY<STRING>)) AS author_names,
        IFNULL(wa.author_alternate_names, CAST([] AS ARRAY<STRING>)) AS author_alternate_names,
        IFNULL(w.other_titles, CAST([] AS ARRAY<STRING>)) AS other_titles,
        IFNULL(wtt.translated_titles, CAST([] AS ARRAY<STRING>)) AS translated_titles,
        IFNULL(w.subjects, CAST([] AS ARRAY<STRING>)) AS subjects,
        w.description,
        w.first_sentence,
        w.notes,
        w.first_publish_date,
        IFNULL(ea.edition_count, 0) AS edition_count,
        ea.first_edition_publish_year,
        ea.latest_edition_publish_year,
        IFNULL(ea.publishers, CAST([] AS ARRAY<STRING>)) AS publishers,

        ARRAY_TO_STRING(
          ARRAY(
            SELECT x
            FROM UNNEST(ARRAY_CONCAT(
              [w.title],
              IF(w.subtitle IS NULL, CAST([] AS ARRAY<STRING>), [w.subtitle]),
              IFNULL(w.other_titles, CAST([] AS ARRAY<STRING>)),
              IFNULL(wtt.translated_titles, CAST([] AS ARRAY<STRING>))
            )) AS x
            WHERE x IS NOT NULL AND x != ''
          ),
          ' '
        ) AS title_search_text,

        ARRAY_TO_STRING(
          ARRAY(
            SELECT x
            FROM UNNEST(ARRAY_CONCAT(
              IFNULL(wa.author_names, CAST([] AS ARRAY<STRING>)),
              IFNULL(wa.author_alternate_names, CAST([] AS ARRAY<STRING>))
            )) AS x
            WHERE x IS NOT NULL AND x != ''
          ),
          ' '
        ) AS author_search_text,

        (
          LEAST(IFNULL(ea.edition_count, 0), 250) * 4 +
          CASE WHEN ARRAY_LENGTH(IFNULL(wa.author_names, CAST([] AS ARRAY<STRING>))) > 0 THEN 60 ELSE 0 END +
          CASE WHEN w.description IS NOT NULL THEN 30 ELSE 0 END +
          CASE WHEN w.first_publish_date IS NOT NULL THEN 15 ELSE 0 END
        ) AS canonical_score

      FROM \`audiobookcovers-487104.openlibrary.works_normalized\` w
      LEFT JOIN \`audiobookcovers-487104.openlibrary.work_author_aggregates\` wa
        ON wa.work_olid = w.work_olid
      LEFT JOIN work_translated_titles wtt
        ON wtt.work_olid = w.work_olid
      LEFT JOIN \`audiobookcovers-487104.openlibrary.edition_aggregates\` ea
        ON ea.work_olid = w.work_olid;
    `,
  },
  {
    name: "work_author_aggregates",
    requires: ["work_author_links", "authors_normalized"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.work_author_aggregates\`
      CLUSTER BY work_olid AS
      WITH names AS (
        SELECT
          wal.work_olid,
          ARRAY_AGG(DISTINCT a.name IGNORE NULLS) AS author_names
        FROM \`audiobookcovers-487104.openlibrary.work_author_links\` wal
        JOIN \`audiobookcovers-487104.openlibrary.authors_normalized\` a
          ON a.author_olid = wal.author_olid
        GROUP BY wal.work_olid
      ),
      alts AS (
        SELECT
          wal.work_olid,
          ARRAY_AGG(DISTINCT alt IGNORE NULLS) AS author_alternate_names
        FROM \`audiobookcovers-487104.openlibrary.work_author_links\` wal
        JOIN \`audiobookcovers-487104.openlibrary.authors_normalized\` a
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
    `,
  },
  {
    name: "work_author_links",
    requires: ["works_normalized"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.work_author_links\`
      CLUSTER BY author_olid, work_olid AS
      SELECT DISTINCT
        w.work_olid,
        author_id AS author_olid
      FROM \`audiobookcovers-487104.openlibrary.works_normalized\` w,
      UNNEST(IFNULL(w.author_ids, CAST([] AS ARRAY<STRING>))) AS author_id
      WHERE author_id IS NOT NULL;
    `,
  },
  {
    name: "edition_aggregates",
    requires: ["editions_normalized"],
    query: `
      CREATE OR REPLACE TABLE \`audiobookcovers-487104.openlibrary.edition_aggregates\`
      CLUSTER BY work_olid AS
      WITH base AS (
        SELECT *
        FROM \`audiobookcovers-487104.openlibrary.editions_normalized\`
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
    `,
  },
]);

function buildQueryMap<const TQueries extends readonly QueryDefinition[]>(
  queries: TQueries,
) {
  return new Map<QueryNames<TQueries>, TQueries[number]>(
    queries.map((query) => [query.name, query]),
  );
}

export function isQueryName<const TQueries extends readonly QueryDefinition[]>(
  queries: TQueries,
  value: string,
): value is QueryNames<TQueries> {
  return buildQueryMap(queries).has(value as QueryNames<TQueries>);
}

function getRequires<const TQueries extends readonly QueryDefinition[]>(
  query: TQueries[number],
): readonly QueryNames<TQueries>[] {
  return (query.requires ?? []) as readonly QueryNames<TQueries>[];
}

function getRequiredQueryNames<
  const TQueries extends readonly QueryDefinition[],
>(queries: TQueries, target: QueryNames<TQueries>) {
  const queriesByName = buildQueryMap(queries);
  const requiredNames = new Set<QueryNames<TQueries>>();
  const stack: QueryNames<TQueries>[] = [target];

  while (stack.length > 0) {
    const name = stack.pop();

    if (!name || requiredNames.has(name)) continue;

    const query = queriesByName.get(name);

    if (!query) {
      throw new Error(`Unknown query "${name}"`);
    }

    requiredNames.add(name);

    for (const dependency of getRequires<TQueries>(query)) {
      stack.push(dependency);
    }
  }

  return requiredNames;
}

export function* getQueryForTarget<
  const TQueries extends readonly QueryDefinition[],
  const TTarget extends QueryNames<TQueries>,
>(
  queries: TQueries,
  target: TTarget,
): Generator<readonly TQueries[number][], void> {
  const remaining = getRequiredQueryNames(queries, target);
  const completed = new Set<QueryNames<TQueries>>();

  while (remaining.size > 0) {
    const runnable: TQueries[number][] = [];

    for (const query of queries) {
      if (!remaining.has(query.name)) continue;
      if (
        !getRequires<TQueries>(query).every((dependency) =>
          completed.has(dependency),
        )
      ) {
        continue;
      }

      runnable.push(query);
    }

    if (runnable.length === 0) {
      const blockedQueries = queries
        .filter((query) => remaining.has(query.name))
        .map((query) => query.name);

      throw new Error(
        `Could not resolve runnable queries for target "${target}". Blocked queries: ${blockedQueries.join(", ")}`,
      );
    }

    yield runnable;

    for (const query of runnable) {
      remaining.delete(query.name);
      completed.add(query.name);
    }
  }
}
