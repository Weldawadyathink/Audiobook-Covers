import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  createBigQueryClient,
  createPostgresClient,
  copyBigQueryRowsToPostgres,
} from "./utils";

const BIGQUERY_PROJECT = "audiobookcovers-487104";

type OpenLibraryWorkSearchRow = {
  olid: string;
  canonical_score: number;
  title: string;
  subtitle: string | null;
  title_aliases: string[];
  author_names: string[];
  author_alternate_names: string[];
  first_publish_date: string | null;
  first_edition_publish_year: number | null;
  latest_edition_publish_year: number | null;
  edition_count: number;
  subjects: string[];
  description: string | null;
  publishers: string[];
  language_ids: string[];
};

const OpenLibrarySyncPayload = z.object({
  dumpDate: z.string(),
});

export const openLibrarySyncWorkSearchTask = schemaTask({
  id: "openlibrary-sync-work-search",
  schema: OpenLibrarySyncPayload,
  machine: "small-1x",
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({ dumpDate }) => {
    console.log(`Syncing work metadata for dump ${dumpDate}`);
    const sql = createPostgresClient();
    const bigQuery = createBigQueryClient();

    try {
      const insertedCount =
        await copyBigQueryRowsToPostgres<OpenLibraryWorkSearchRow>({
          bigQuery,
          sql,
          bigQueryQuery: `
          SELECT
            olid,
            canonical_score,
            title,
            subtitle,
            title_aliases,
            author_names,
            author_alternate_names,
            first_publish_date,
            first_edition_publish_year,
            latest_edition_publish_year,
            edition_count,
            subjects,
            description,
            publishers,
            language_ids
          FROM \`${BIGQUERY_PROJECT}.openlibrary.works_search\`
          ORDER BY olid
        `,
          tableName: "openlibrary_work_search",
          columns: [
            "olid",
            "canonical_score",
            "title",
            "subtitle",
            "title_aliases",
            "author_names",
            "author_alternate_names",
            "first_publish_date",
            "first_edition_publish_year",
            "latest_edition_publish_year",
            "edition_count",
            "subjects",
            "description",
            "publishers",
            "language_ids",
          ],
          mapRow: (row) => ({
            olid: row.olid,
            canonical_score: Number(row.canonical_score ?? 0),
            title: row.title,
            subtitle: row.subtitle,
            title_aliases: row.title_aliases ?? [],
            author_names: row.author_names ?? [],
            author_alternate_names: row.author_alternate_names ?? [],
            first_publish_date: row.first_publish_date,
            first_edition_publish_year:
              row.first_edition_publish_year === null
                ? null
                : Number(row.first_edition_publish_year),
            latest_edition_publish_year:
              row.latest_edition_publish_year === null
                ? null
                : Number(row.latest_edition_publish_year),
            edition_count: Number(row.edition_count ?? 0),
            subjects: row.subjects ?? [],
            description: row.description,
            publishers: row.publishers ?? [],
            language_ids: row.language_ids ?? [],
          }),
        });

      console.log(
        `Synced ${insertedCount} work metadata rows for dump ${dumpDate}`,
      );
      return { dumpDate, insertedCount };
    } finally {
      await sql.end();
    }
  },
});
