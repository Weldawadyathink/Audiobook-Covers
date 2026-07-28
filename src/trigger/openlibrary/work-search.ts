// zod/v4 to match the validator surface `sqlTools` expects (see src/db.ts).
import { z } from "zod/v4";
import { createPostgresReadDb } from "@/db.node";

export const OpenLibraryWorkSearchRow = z.object({
  olid: z.string(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  author_names: z.array(z.string()).nullable(),
  author_aliases: z.array(z.string()).nullable(),
  title_aliases: z.array(z.string()).nullable(),
  subjects: z.array(z.string()).nullable(),
  description: z.string().nullable(),
  first_publish_year: z.number().int().nullable(),
  edition_count: z.number().int().nullable(),
  canonical_score: z.number().int().nullable(),
});

export type OpenLibraryWorkSearchRow = z.infer<typeof OpenLibraryWorkSearchRow>;

const MAX_LIMIT = 25;

let db: ReturnType<typeof createPostgresReadDb> | null = null;

function getDb() {
  db ??= createPostgresReadDb({ application_name: "openlibrary-work-search" });
  return db;
}

/**
 * Releases the pooled connection opened by {@link searchOpenLibraryWorks}.
 * Trigger.dev tasks should call this from a `finally` so the run can exit.
 */
export async function closeOpenLibraryWorkSearch() {
  if (!db) return;
  const { sql } = db;
  db = null;
  await sql.end();
}

/**
 * Full-text search over the whole `openlibrary_work` catalogue.
 *
 * The `to_tsvector(...)` expressions below are written to match the two GIN
 * expression indexes declared in `src/db/schema.ts`
 * (`idx_openlibrary_work_title_search` / `idx_openlibrary_work_author_names_search`)
 * verbatim — Postgres only uses an expression index when the query expression is
 * an exact match, so changing the regconfig or the COALESCE here silently
 * degrades this to a sequential scan over ~30M rows.
 */
export async function searchOpenLibraryWorks(query: string, limit = 10) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return [];
  }

  const { sqlTools } = getDb();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);

  return await sqlTools.many(OpenLibraryWorkSearchRow)`
    WITH q AS (
      SELECT websearch_to_tsquery('simple'::regconfig, ${trimmedQuery}) AS tsq
    )
    SELECT
      work.olid,
      work.title,
      work.subtitle,
      work.author_names,
      work.author_aliases,
      work.title_aliases,
      work.subjects,
      work.description,
      work.first_publish_year,
      work.edition_count,
      work.canonical_score
    FROM openlibrary_work work, q
    WHERE to_tsvector('simple'::regconfig, COALESCE(work.title, '')) @@ q.tsq
       OR to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')) @@ q.tsq
    ORDER BY
      (
        ts_rank(
          to_tsvector('simple'::regconfig, COALESCE(work.title, '')),
          q.tsq
        ) * 4
        + ts_rank(
          to_tsvector('simple'::regconfig, immutable_array_to_string(work.author_names, ' ')),
          q.tsq
        ) * 2
      ) DESC,
      work.canonical_score DESC NULLS LAST,
      work.edition_count DESC NULLS LAST,
      work.olid
    LIMIT ${boundedLimit}
  `;
}
