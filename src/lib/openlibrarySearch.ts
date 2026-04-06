function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function tokenizeSearchQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ).slice(0, 8);
}

const SEARCH_RESULT_COLUMNS = [
  "olid",
  "title",
  "subtitle",
  "author_names",
  "author_alternate_names",
  "subjects",
  "description",
  "first_publish_date",
  "first_edition_publish_year",
  "latest_edition_publish_year",
  "other_titles",
  "translated_titles",
  "edition_titles",
  "edition_subtitles",
  "publishers",
  "languages",
  "edition_count",
  "canonical_score",
] as const;

const OMIT_EMPTY_ARRAY_FIELDS = new Set([
  "author_alternate_names",
  "subjects",
  "other_titles",
  "translated_titles",
  "edition_titles",
  "edition_subtitles",
  "publishers",
  "languages",
]);

export function buildOpenLibrarySearchSql(
  parquetPath: string,
  query: string,
  limit = 10,
): string {
  const trimmedQuery = query.trim();
  const escapedQuery = escapeSqlLiteral(trimmedQuery);
  const tokens = tokenizeSearchQuery(trimmedQuery);

  const tokenFilter =
    tokens.length > 0
      ? tokens
          .map((token) => `e.search_text ILIKE '%${escapeSqlLiteral(token)}%'`)
          .join(" AND ")
      : `e.search_text ILIKE '%${escapedQuery}%'`;

  const tokenScore =
    tokens.length > 0
      ? tokens
          .map(
            (token) =>
              `CASE WHEN e.search_text ILIKE '%${escapeSqlLiteral(token)}%' THEN 30 ELSE 0 END`,
          )
          .join(" + ")
      : "0";

  return `
    WITH ranked AS (
      SELECT
        e.olid,
        e.title,
        e.subtitle,
        e.author_names,
        e.author_alternate_names,
        e.subjects,
        e.description,
        e.first_publish_date,
        e.first_edition_publish_year,
        e.latest_edition_publish_year,
        e.other_titles,
        e.translated_titles,
        e.edition_titles,
        e.edition_subtitles,
        e.publishers,
        e.languages,
        e.edition_count,
        e.canonical_score,
        (
          CASE WHEN lower(e.title) = lower('${escapedQuery}') THEN 1400 ELSE 0 END +
          CASE WHEN e.title ILIKE '${escapedQuery}%' THEN 700 ELSE 0 END +
          CASE WHEN coalesce(e.subtitle, '') ILIKE '${escapedQuery}%' THEN 250 ELSE 0 END +
          CASE WHEN e.title_alias_text ILIKE '%${escapedQuery}%' THEN 320 ELSE 0 END +
          CASE WHEN e.author_text ILIKE '%${escapedQuery}%' THEN 180 ELSE 0 END +
          CASE WHEN e.search_text ILIKE '%${escapedQuery}%' THEN 120 ELSE 0 END +
          ${tokenScore} +
          least(coalesce(e.edition_count, 0), 250) * 3 +
          coalesce(e.canonical_score, 0)
        ) AS relevance_score
      FROM read_parquet('${parquetPath}') e
      WHERE ${tokenFilter}
    )
    SELECT
      olid,
      title,
      subtitle,
      author_names,
      author_alternate_names,
      subjects,
      description,
      first_publish_date,
      first_edition_publish_year,
      latest_edition_publish_year,
      other_titles,
      translated_titles,
      edition_titles,
      edition_subtitles,
      publishers,
      languages,
      edition_count,
      canonical_score
    FROM ranked
    ORDER BY relevance_score DESC, edition_count DESC NULLS LAST, canonical_score DESC NULLS LAST
    LIMIT ${limit}
  `;
}

export function shapeOpenLibrarySearchRows(rows: Array<Array<unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    SEARCH_RESULT_COLUMNS.forEach((column, index) => {
      obj[column] = row[index];
    });

    for (const field of OMIT_EMPTY_ARRAY_FIELDS) {
      if (Array.isArray(obj[field]) && (obj[field] as unknown[]).length === 0) {
        delete obj[field];
      }
    }

    return obj;
  });
}
