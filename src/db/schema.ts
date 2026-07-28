import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  vector,
  pgSchema,
  type PgSchema,
} from "drizzle-orm/pg-core";
import { env } from "@/env.node";

/**
 * The one place that decides which schema this process talks to.
 *
 * Exported as a plain string because the ETL is raw SQL, not Drizzle, and would
 * otherwise have to re-derive this. It previously used `current_schema()`, which
 * is a *different* source of truth: `current_schema()` follows the role's
 * `search_path`, while everything Drizzle emits follows `APP_STAGE`. When those
 * disagree the ETL writes to one schema and the website reads from another, and
 * nothing errors — the site just silently shows a stale catalogue.
 */
export const schemaName = env.APP_STAGE === "production" ? "prod" : "dev";

export const schema =
  env.APP_STAGE === "production"
    ? pgSchema("prod")
    : (pgSchema("dev") as unknown as PgSchema<"prod">);

export const reddit_post = schema.table(
  "reddit_post",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(),
    title: text("title"),
    body: text("body"),
    author: text("author"),
    flair: text("flair"),
  },
  (table) => [index("idx_reddit_post_status").on(table.status)],
);

export const reddit_comment = schema.table(
  "reddit_comment",
  {
    id: uuid("id").primaryKey(),
    post_id: text("post_id").notNull(),
    parent_comment_id: uuid("parent_comment_id"),
    content: text("content"),
  },
  (table) => [
    foreignKey({
      columns: [table.post_id],
      foreignColumns: [reddit_post.id],
      name: "reddit_comment_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parent_comment_id],
      foreignColumns: [table.id],
      name: "reddit_comment_parent_comment_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const image = schema.table(
  "image",
  {
    id: uuid("id").primaryKey(),
    source: text("source"),
    reddit_post_id: text("reddit_post_id"),
    reddit_comment_id: uuid("reddit_comment_id"),
    extension: text("extension"),
    searchable: boolean("searchable").default(true),
    blurhash: text("blurhash"),
    deleted: boolean("deleted").notNull().default(false),
    openlibrary_work_id: text("openlibrary_work_id"),
    openlibrary_work_id_confidence: text("openlibrary_work_id_confidence"),
    openlibrary_work_id_model: text("openlibrary_work_id_model"),
    embedding_jina_clip_v2: vector("embedding_jina_clip_v2", {
      dimensions: 1024,
    }),
  },
  (table) => [
    index("idx_image_searchable").using("btree", table.searchable),
    // The cover page groups by work ("more covers for this book") and the
    // title/author search joins images to their work, both of which are
    // openlibrary_work_id lookups rather than scans.
    index("idx_image_openlibrary_work_id").using(
      "btree",
      table.openlibrary_work_id,
    ),
    foreignKey({
      columns: [table.reddit_post_id],
      foreignColumns: [reddit_post.id],
      name: "fk_image_reddit_post_id",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.reddit_comment_id],
      foreignColumns: [reddit_comment.id],
      name: "fk_image_reddit_comment_id",
    }).onDelete("set null"),
  ],
);

export const openlibrary_work = schema.table(
  "openlibrary_work",
  {
    olid: text("olid").primaryKey(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    author_names: text("author_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    author_aliases: text("author_aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    title_aliases: text("title_aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    subjects: text("subjects")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    description: text("description"),
    first_publish_year: integer("first_publish_year"),
    edition_count: integer("edition_count"),
    canonical_score: integer("canonical_score"),
  },
  (table) => [
    index("idx_openlibrary_work_title_search").using(
      "gin",
      sql`to_tsvector('simple'::regconfig, COALESCE(${table.title}, ''))`,
    ),
    index("idx_openlibrary_work_author_names_search").using(
      "gin",
      sql`to_tsvector('simple'::regconfig, immutable_array_to_string(${table.author_names}, ' '))`,
    ),
  ],
);

/**
 * Single-row lock + progress record for the monthly OpenLibrary ETL.
 *
 * `completed_dump_date` (what finished) and `status`/`active_*` (what is running
 * now) are deliberately separate columns: the previous single `status TEXT`
 * column had to encode both, so it could not represent "2025-01-01 completed,
 * 2025-02-01 currently running".
 *
 * Mutual exclusion is a lease rather than `pg_advisory_lock` so that it survives
 * a transaction-mode connection pooler, where session-scoped advisory locks are
 * silently unsafe. A run that dies without releasing is reclaimed once
 * `lease_expires_at` passes.
 */
export const openlibrary_etl_state = schema.table(
  "openlibrary_etl_state",
  {
    id: boolean("id").primaryKey().default(true),
    status: text("status").notNull().default("idle"),
    /** Dump date of the most recent fully successful run. */
    completed_dump_date: text("completed_dump_date"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    /** Dump date the in-flight (or most recently failed) run is processing. */
    active_dump_date: text("active_dump_date"),
    /** Trigger.dev run id holding the lease, for tracing a stuck run. */
    active_run_id: text("active_run_id"),
    started_at: timestamp("started_at", { withTimezone: true }),
    lease_expires_at: timestamp("lease_expires_at", { withTimezone: true }),
    /**
     * Whether `openlibrary_work` currently holds the whole catalogue.
     *
     * A rebuild swaps in a table containing only OLIDs referenced by `image`,
     * builds the full table beside it at 1x storage, then swaps again. In
     * between, the website is fine — it only ever looks up OLIDs it already
     * stores — but the agentic OLID workflow would search a near-empty
     * catalogue, find nothing, and write wrong or null OLIDs back into `image`.
     *
     * Deliberately not folded into `status`, which is wrong in both directions:
     * `running` covers hours of BigQuery work during which the catalogue is
     * completely intact, and a run that dies mid-swap leaves `failed` while the
     * catalogue is still reduced and must stay blocked. The two facts are
     * independent.
     */
    catalogue_state: text("catalogue_state").notNull().default("full"),
    last_error: text("last_error"),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("openlibrary_etl_state_singleton", sql`${table.id}`),
    check(
      "openlibrary_etl_state_status",
      sql`${table.status} IN ('idle', 'running', 'failed')`,
    ),
    check(
      "openlibrary_etl_state_catalogue_state",
      sql`${table.catalogue_state} IN ('full', 'reduced')`,
    ),
  ],
);

export const web_user = schema.table(
  "web_user",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    password_hash: text("password_hash").notNull(),
  },
  (table) => [unique("web_user_username_key").on(table.username)],
);

export const session = schema.table(
  "session",
  {
    session_id: text("session_id").primaryKey(),
    user_id: integer("user_id").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_sessions_user_id").on(table.user_id),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [web_user.id],
      name: "session_user_id_fkey",
    }).onDelete("cascade"),
  ],
);
