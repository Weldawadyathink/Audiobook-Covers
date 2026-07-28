// zod/v4 to match the validator surface `sqlTools` expects (see src/db.ts).
import { z } from "zod/v4";
import { createPostgresReadDb } from "@/db.node";
import { readCatalogueState } from "./etl-state";

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
 *
 * The four array columns are selected through `to_jsonb(...)` rather than
 * directly. The pool is created with `fetch_types: false` (see `src/db.ts`),
 * which leaves postgres.js without the element-type information it needs to
 * decode a `text[]`, so a bare `author_names` arrives as the raw Postgres array
 * literal `{a,b}` and fails `z.array(z.string())` on every row. `jsonb` has a
 * built-in decoder that does not consult the type catalogue, so the database
 * does the encoding and there is no hand-rolled array-literal parser here to get
 * wrong on a title containing a comma or a quote.
 *
 * Note also that a raw backtick inside this tagged template would terminate the
 * string — keep prose like that in this comment, not in the SQL below.
 */
export async function searchOpenLibraryWorks(query: string, limit = 10) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return [];
  }

  const { sqlTools } = getDb();

  // Throw rather than return [] when the catalogue is mid-rebuild. An empty
  // result is indistinguishable from "no such book" to the caller, and the
  // caller's response to that is to write a null or guessed OLID into `image` —
  // silent data corruption that outlives the rebuild window. A single-row
  // primary key lookup is free next to a full-text scan of ~30M rows.
  if ((await readCatalogueState({ sqlTools })) === "reduced") {
    throw new Error(
      "OpenLibrary catalogue is mid-rebuild (catalogue_state = 'reduced'); " +
        "search is unavailable until the ETL finishes",
    );
  }

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);

  return await sqlTools.many(OpenLibraryWorkSearchRow)`
    WITH q AS (
      SELECT websearch_to_tsquery('simple'::regconfig, ${trimmedQuery}) AS tsq
    )
    SELECT
      work.olid,
      work.title,
      work.subtitle,
      -- to_jsonb, not the bare column. See the note above the function.
      to_jsonb(work.author_names) AS author_names,
      to_jsonb(work.author_aliases) AS author_aliases,
      to_jsonb(work.title_aliases) AS title_aliases,
      to_jsonb(work.subjects) AS subjects,
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
