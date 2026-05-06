import { env } from "@/env";
import { Client } from "@elastic/elasticsearch";
import type { estypes } from "@elastic/elasticsearch";
import type { Readable } from "node:stream";

export const OPENLIBRARY_WORK_SEARCH_INDEX = "openlibrary-works-search";

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
}
