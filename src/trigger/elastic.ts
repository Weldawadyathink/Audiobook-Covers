import { env } from "@/env.node";
import { Client } from "@elastic/elasticsearch";
import type { estypes } from "@elastic/elasticsearch";
import type { Readable } from "node:stream";

export const OPENLIBRARY_WORK_SEARCH_INDEX = "openlibrary-works-search";
const DEFAULT_OPENLIBRARY_WORK_SEARCH_LIMIT = 10;
const INTERNAL_OPENLIBRARY_WORK_SEARCH_LIMIT = 25;
const MAX_OPENLIBRARY_WORK_SEARCH_LIMIT = 25;

export type OpenLibraryWorkSearchDocument = {
  olid: string;
  title: string | null;
  subtitle: string | null;
  author_ids: string[];
  author_names: string[];
  author_alternate_names: string[];
  author_search_text: string;
  other_titles: string[];
  translated_titles: string[];
  title_aliases: string[];
  title_search_text: string;
  subjects: string[];
  subject_places: string[];
  subject_times: string[];
  subject_people: string[];
  description: string | null;
  first_sentence: string | null;
  notes: string | null;
  first_publish_date: string | null;
  cover_edition_id: string | null;
  covers: number[];
  edition_count: number;
  edition_titles: string[];
  edition_subtitles: string[];
  first_edition_publish_year: number | null;
  latest_edition_publish_year: number | null;
  publishers: string[];
  publish_places: string[];
  language_ids: string[];
  edition_author_ids: string[];
  edition_publish_years: number[];
  by_statements: string[];
  canonical_score: number;
};

export type OpenLibraryWorkSearchResult = {
  olid: string;
  title: string | null;
  subtitle: string | null;
  author_names?: string[];
  subjects?: string[];
  description: string | null;
  other_titles?: string[];
  title_aliases?: string[];
};

const searchTextField = {
  type: "text",
  analyzer: "standard",
  index_options: "docs",
  norms: false,
} satisfies estypes.MappingTextProperty;

const storedTextField = {
  type: "text",
  index: false,
} satisfies estypes.MappingTextProperty;

const storedKeywordField = {
  type: "keyword",
  index: false,
  doc_values: false,
} satisfies estypes.MappingKeywordProperty;

const storedIntegerField = {
  type: "integer",
  index: false,
  doc_values: false,
} satisfies estypes.MappingIntegerNumberProperty;

export const openLibraryWorkSearchMapping = {
  dynamic: "strict",
  date_detection: false,
  numeric_detection: false,
  properties: {
    olid: {
      type: "keyword",
      doc_values: false,
    },
    title: storedTextField,
    subtitle: storedTextField,
    author_ids: storedKeywordField,
    author_names: storedTextField,
    author_alternate_names: storedTextField,
    author_search_text: searchTextField,
    other_titles: storedTextField,
    translated_titles: storedTextField,
    title_aliases: storedTextField,
    title_search_text: searchTextField,
    subjects: storedTextField,
    subject_places: storedTextField,
    subject_times: storedTextField,
    subject_people: storedTextField,
    description: storedTextField,
    first_sentence: storedTextField,
    notes: storedTextField,
    first_publish_date: storedKeywordField,
    cover_edition_id: storedKeywordField,
    covers: storedIntegerField,
    edition_count: storedIntegerField,
    edition_titles: storedTextField,
    edition_subtitles: storedTextField,
    first_edition_publish_year: storedIntegerField,
    latest_edition_publish_year: storedIntegerField,
    publishers: storedTextField,
    publish_places: storedTextField,
    language_ids: storedKeywordField,
    edition_author_ids: storedKeywordField,
    edition_publish_years: storedIntegerField,
    by_statements: storedTextField,
    canonical_score: {
      type: "integer",
      index: false,
      doc_values: true,
    },
  },
} satisfies estypes.MappingTypeMapping;

const OMIT_EMPTY_ARRAY_FIELDS = new Set<keyof OpenLibraryWorkSearchResult>([
  "subjects",
  "other_titles",
  "title_aliases",
]);

function shapeOpenLibraryWorkSearchResult(
  document: OpenLibraryWorkSearchDocument,
): OpenLibraryWorkSearchResult {
  const result: OpenLibraryWorkSearchResult = {
    olid: document.olid,
    title: document.title,
    subtitle: document.subtitle,
    author_names: document.author_names,
    subjects: document.subjects,
    description: document.description,
    other_titles: document.other_titles,
    title_aliases: document.title_aliases,
  };

  for (const field of OMIT_EMPTY_ARRAY_FIELDS) {
    if (Array.isArray(result[field]) && result[field].length === 0) {
      delete result[field];
    }
  }

  return result;
}

function clampOpenLibrarySearchLimit(limit: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_OPENLIBRARY_WORK_SEARCH_LIMIT;
  }

  return Math.max(
    1,
    Math.min(MAX_OPENLIBRARY_WORK_SEARCH_LIMIT, Math.floor(limit)),
  );
}

function tokenizeSearchQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function chooseOpenLibraryWorkSearchResults(
  hits: Array<{ score: number; result: OpenLibraryWorkSearchResult }>,
  query: string,
  requestedLimit: number,
) {
  if (hits.length === 0) {
    return [];
  }

  const topScore = hits[0]?.score ?? 0;
  if (topScore <= 0) {
    return hits.slice(0, requestedLimit).map((hit) => hit.result);
  }

  const shortQuery = tokenizeSearchQuery(query).length <= 2;
  const clustered = (hits[9]?.score ?? 0) >= topScore * 0.65;
  const minKeep = Math.min(shortQuery ? 3 : 5, requestedLimit);
  const maxKeep = Math.min(
    requestedLimit,
    clustered ? 15 : shortQuery ? 8 : 12,
  );
  const relativeThreshold = shortQuery ? 0.5 : 0.35;

  return hits
    .filter((hit, index) => {
      if (index < minKeep) {
        return true;
      }

      return hit.score >= topScore * relativeThreshold;
    })
    .slice(0, maxKeep)
    .map((hit) => hit.result);
}

export class Elastic {
  client: Client;

  constructor() {
    this.client = new Client({
      node: env.ELASTICSEARCH_URL,
      auth: {
        apiKey: env.ELASTICSEARCH_API_KEY,
      },
      serverMode: "serverless",
    });
  }

  async clearWorkSearchIndex(index = OPENLIBRARY_WORK_SEARCH_INDEX) {
    const exists = await this.client.indices.exists({ index });

    if (exists) {
      await this.client.indices.delete({ index });
    }

    await this.client.indices.create({
      index,
      mappings: openLibraryWorkSearchMapping,
    });
  }

  async bulkIndexWorkSearchDocuments(
    datasource: Readable,
    index = OPENLIBRARY_WORK_SEARCH_INDEX,
  ) {
    const droppedDocuments: { olid: string; status: number; error: unknown }[] =
      [];

    const stats = await this.client.helpers.bulk<OpenLibraryWorkSearchDocument>(
      {
        datasource,
        concurrency: 4,
        flushBytes: 5 * 1024 * 1024,
        onDocument: (document) => [
          { index: { _index: index, _id: document.olid } },
          document,
        ],
        onDrop: ({ document, status, error }) => {
          if (droppedDocuments.length < 10) {
            droppedDocuments.push({ olid: document.olid, status, error });
          }
        },
        refreshOnCompletion: index,
      },
    );

    if (stats.failed > 0) {
      throw new Error(
        `Failed to index ${stats.failed} OpenLibrary work search documents: ${JSON.stringify(droppedDocuments)}`,
      );
    }

    return stats;
  }

  async searchOpenLibraryWorks(
    query: string,
    limit = DEFAULT_OPENLIBRARY_WORK_SEARCH_LIMIT,
    index = OPENLIBRARY_WORK_SEARCH_INDEX,
  ): Promise<OpenLibraryWorkSearchResult[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }

    const exactWork = await this.getOpenLibraryWorkByOlid(trimmedQuery, index);
    if (exactWork) {
      return [exactWork];
    }

    const requestedLimit = clampOpenLibrarySearchLimit(limit);

    const response = await this.client.search<OpenLibraryWorkSearchDocument>({
      index,
      size: INTERNAL_OPENLIBRARY_WORK_SEARCH_LIMIT,
      query: {
        function_score: {
          query: {
            bool: {
              should: [
                {
                  match: {
                    title_search_text: {
                      query: trimmedQuery,
                      boost: 4,
                    },
                  },
                },
                {
                  match: {
                    title_search_text: {
                      query: trimmedQuery,
                      operator: "and",
                      boost: 8,
                    },
                  },
                },
                {
                  match: {
                    author_search_text: {
                      query: trimmedQuery,
                      boost: 2,
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
          functions: [
            {
              field_value_factor: {
                field: "canonical_score",
                factor: 0.01,
                modifier: "log1p",
                missing: 0,
              },
            },
          ],
          boost_mode: "sum",
          score_mode: "sum",
        },
      },
    });

    const hits = response.hits.hits.flatMap((hit) =>
      hit._source
        ? [
            {
              score: hit._score ?? 0,
              result: shapeOpenLibraryWorkSearchResult(hit._source),
            },
          ]
        : [],
    );

    return chooseOpenLibraryWorkSearchResults(
      hits,
      trimmedQuery,
      requestedLimit,
    );
  }

  async getOpenLibraryWorkByOlid(
    olid: string,
    index = OPENLIBRARY_WORK_SEARCH_INDEX,
  ): Promise<OpenLibraryWorkSearchResult | null> {
    const trimmedOlid = olid.trim();
    if (!/^OL\d+W$/i.test(trimmedOlid)) {
      return null;
    }

    try {
      const response = await this.client.get<OpenLibraryWorkSearchDocument>({
        index,
        id: trimmedOlid.toUpperCase(),
      });

      return response._source
        ? shapeOpenLibraryWorkSearchResult(response._source)
        : null;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
