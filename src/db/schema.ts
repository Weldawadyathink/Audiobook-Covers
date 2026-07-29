import { sql } from "drizzle-orm";
import {
  bit,
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
    /**
     * 64-bit DCT perceptual hash of the original file, for duplicate detection.
     *
     * Deliberately 64 bits and deliberately compared with a Hamming threshold
     * rather than for equality. Both choices are measured, not guessed, over 400
     * covers hashed at two different resolutions:
     *
     *   - Equality alone misses 10% of duplicates at 64 bits and 40% at 256,
     *     because rescaling flips a bit or two even when nothing else changes.
     *   - At a threshold of 4, the same-image distance never exceeded 2 while
     *     the closest distinct pair sat at 10 — 100% recall, no false pairs
     *     across 159,600 comparisons.
     *
     * Widening the hash only moves the false-pair floor up; it does not buy
     * separation that a 10-bit dead zone hasn't already provided.
     *
     * Stored as `bit(64)` so Postgres can do the comparison itself with
     * `bit_count(a # b)`. No index can serve a Hamming predicate, so the pairing
     * query is an intentional sequential self-join — roughly 10s over the whole
     * table, which is fine for a job that runs by hand.
     */
    phash64: bit("phash64", { dimensions: 64 }),
    /** Pixel dimensions and byte size of the original, for picking a winner. */
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    /**
     * Set on the losing rows of a duplicate group, pointing at the kept image.
     *
     * A pointer rather than a delete because `cover_feedback` rows and
     * `openlibrary_work_id` matches hang off these images: removing the row
     * would discard human judgements about a cover that still exists, and a
     * merge that turns out wrong could not be undone.
     */
    duplicate_of: uuid("duplicate_of"),
  },
  (table) => [
    index("idx_image_searchable").using("btree", table.searchable),
    index("idx_image_duplicate_of").using("btree", table.duplicate_of),
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
    foreignKey({
      columns: [table.duplicate_of],
      foreignColumns: [table.id],
      name: "fk_image_duplicate_of",
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
    // The tsvector index above cannot serve the array-overlap operator. Finding
    // "other works by this author" is an `author_names && ARRAY[…]` test, which
    // without this index is a sequential scan of the whole catalogue.
    index("idx_openlibrary_work_author_names_gin").using(
      "gin",
      table.author_names,
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

/**
 * A registered account. Passkey-only — there is no password column by design.
 *
 * Signing up is deliberately unprivileged: an account can do nothing at all
 * until `is_admin` is set, which only an existing admin can do. That is what
 * makes it safe to leave registration open at an unlisted URL without email
 * verification — an unapproved account is inert, so a bogus signup costs a row
 * and nothing else.
 *
 * Bootstrap the first admin by hand:
 *   UPDATE dev.web_user SET is_admin = true WHERE email = 'you@example.com';
 */
export const web_user = schema.table(
  "web_user",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    is_admin: boolean("is_admin").notNull().default(false),
    /** Which admin granted access, kept for an audit trail. */
    approved_by: integer("approved_by"),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_login_at: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    unique("web_user_email_key").on(table.email),
    foreignKey({
      columns: [table.approved_by],
      foreignColumns: [table.id],
      name: "web_user_approved_by_fkey",
    }).onDelete("set null"),
  ],
);

/**
 * A WebAuthn credential (passkey) belonging to a user.
 *
 * `public_key` is the COSE key and `credential_id` the raw credential id, both
 * base64url. `counter` is the authenticator's signature counter, persisted so a
 * cloned authenticator can be detected — it must only ever increase.
 */
export const web_authn_credential = schema.table(
  "web_authn_credential",
  {
    credential_id: text("credential_id").primaryKey(),
    user_id: integer("user_id").notNull(),
    public_key: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_web_authn_credential_user_id").on(table.user_id),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [web_user.id],
      name: "web_authn_credential_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * One in-flight WebAuthn ceremony.
 *
 * The challenge has to survive the round trip between "begin" and "finish", and
 * Workers keep no memory between requests, so it lives here rather than in
 * process state. Rows are short-lived; expired ones are swept on each insert.
 */
export const web_authn_challenge = schema.table(
  "web_authn_challenge",
  {
    challenge: text("challenge").primaryKey(),
    /** Set for registration, where no user row exists yet. */
    email: text("email"),
    user_id: integer("user_id"),
    purpose: text("purpose").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "web_authn_challenge_purpose",
      sql`${table.purpose} IN ('register', 'authenticate')`,
    ),
    index("idx_web_authn_challenge_expires_at").on(table.expires_at),
  ],
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

/**
 * A public report about whether a cover is matched to the right book.
 *
 * `openlibrary_work_id` snapshots the match as it stood when the report was
 * filed. Without it a report becomes unreadable the moment the match changes —
 * "this is wrong" would silently start referring to a book nobody complained
 * about.
 */
export const cover_feedback = schema.table(
  "cover_feedback",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    image_id: uuid("image_id").notNull(),
    /** The match being judged, as it was at submission time. */
    openlibrary_work_id: text("openlibrary_work_id"),
    verdict: text("verdict").notNull(),
    note: text("note"),
    status: text("status").notNull().default("OPEN"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolved_by: integer("resolved_by"),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    /** What the admin did about it, for the audit trail. */
    resolution: text("resolution"),
  },
  (table) => [
    check(
      "cover_feedback_verdict",
      sql`${table.verdict} IN ('CORRECT', 'INCORRECT')`,
    ),
    check(
      "cover_feedback_status",
      sql`${table.status} IN ('OPEN', 'RESOLVED', 'DISMISSED')`,
    ),
    index("idx_cover_feedback_status_created").on(
      table.status,
      table.created_at,
    ),
    index("idx_cover_feedback_image_id").on(table.image_id),
    foreignKey({
      columns: [table.image_id],
      foreignColumns: [image.id],
      name: "cover_feedback_image_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.resolved_by],
      foreignColumns: [web_user.id],
      name: "cover_feedback_resolved_by_fkey",
    }).onDelete("set null"),
  ],
);
