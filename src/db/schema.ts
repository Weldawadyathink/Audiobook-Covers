import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  bit,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

/**
 * Append-only archive of every Reddit `Thing` we have ever fetched.
 *
 * This is the source of truth for the import, and the only table the network
 * writes into. `reddit_post`, `reddit_comment` and `image_candidate` are all
 * projections of it and can be truncated and rebuilt from here with no network
 * access at all — which is the entire point. When the link resolver learns a new
 * host, six years of history are re-resolved locally in seconds instead of
 * re-crawling the subreddit.
 *
 * Rows are per-`Thing`, not per-HTTP-response. A listing of 100 posts becomes
 * 100 rows, because the useful unit for replay is "the post as Reddit described
 * it at time T", not "the page it happened to arrive on".
 *
 * Deduplicated on `(fullname, payload_hash)`, which is what makes daily polling
 * cheap: re-fetching an unchanged post is a no-op insert rather than another
 * 8KB row. A post that is edited produces a second row, so the archive doubles
 * as an edit history. A post edited back to a previous exact state does not
 * record the round trip; that event is not worth a table scan to preserve.
 */
export const reddit_raw = schema.table(
  "reddit_raw",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Reddit fullname, e.g. `t3_j069s5` (post) or `t1_g6xk2mn` (comment). */
    fullname: text("fullname").notNull(),
    kind: text("kind").notNull(),
    /**
     * Where the payload came from.
     *
     * Reddit is the primary source. Arctic Shift is currently used only to
     * enumerate post ids for the historical backfill, but it also holds comments
     * that Reddit will never serve again — at last count ~224 posts have
     * archived comments that the live API reports as absent, because they were
     * removed or deleted. Tagging the source now means those can be layered in
     * later without touching this table's shape or the projection code.
     */
    source: text("source").notNull(),
    fetched_at: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    payload: jsonb("payload").notNull(),
    /** sha256 of the canonicalised payload. See the dedup note above. */
    payload_hash: text("payload_hash").notNull(),
  },
  (table) => [
    uniqueIndex("uq_reddit_raw_fullname_hash").on(
      table.fullname,
      table.payload_hash,
    ),
    // Projection reads "latest row per fullname"; polling reads "has this
    // fullname ever been seen". Both are served by this.
    index("idx_reddit_raw_fullname_fetched").on(
      table.fullname,
      table.fetched_at.desc(),
    ),
    check("reddit_raw_kind", sql`${table.kind} IN ('post', 'comment')`),
    check(
      "reddit_raw_source",
      sql`${table.source} IN ('reddit_api', 'arctic_shift')`,
    ),
  ],
);

/**
 * Current state of one submission, projected from the newest `reddit_raw` row.
 *
 * Rows are created as bare stubs by the id enumeration step (id only, everything
 * else null) and filled in by hydration, so `hydrated_at IS NULL` is the work
 * queue for `reddit-hydrate-posts`.
 */
export const reddit_post = schema.table(
  "reddit_post",
  {
    /** Base36 id without the `t3_` prefix, e.g. `j069s5`. */
    id: text("id").primaryKey(),
    title: text("title"),
    /** `selftext`. Named `body` to match `reddit_comment`. */
    body: text("body"),
    author: text("author"),
    flair: text("flair"),
    permalink: text("permalink"),
    /** The submission's outbound target — an i.redd.it file, a gallery, a link. */
    url: text("url"),
    created_utc: timestamp("created_utc", { withTimezone: true }),
    is_gallery: boolean("is_gallery"),
    over_18: boolean("over_18"),
    /** True when Reddit reports the submission removed, deleted or spam-filtered. */
    removed: boolean("removed"),
    score: integer("score"),
    num_comments: integer("num_comments"),
    /**
     * Null until the submission has been fetched from the Reddit API.
     *
     * Also the re-hydration cursor: the oldest hydrated posts are refreshed
     * first, which is how edits, deletions and score drift eventually land.
     */
    hydrated_at: timestamp("hydrated_at", { withTimezone: true }),
    /** Null until the comment tree has been fetched at least once. */
    comments_fetched_at: timestamp("comments_fetched_at", {
      withTimezone: true,
    }),
    /**
     * Which release of the link resolver last ran over this post.
     *
     * Compared against `RESOLVER_VERSION` in the resolver source. Bumping that
     * constant is the whole re-resolve mechanism — every post falls behind at
     * once and the resolve task picks them up in batches, no migration and no
     * network. Null means never resolved.
     */
    resolver_version: integer("resolver_version"),
    /** Newest archive row this projection was built from. */
    raw_id: bigint("raw_id", { mode: "number" }),
  },
  (table) => [
    index("idx_reddit_post_hydrated_at").on(table.hydrated_at),
    index("idx_reddit_post_comments_fetched_at").on(table.comments_fetched_at),
    index("idx_reddit_post_resolver_version").on(table.resolver_version),
    index("idx_reddit_post_created_utc").on(table.created_utc),
    foreignKey({
      columns: [table.raw_id],
      foreignColumns: [reddit_raw.id],
      name: "fk_reddit_post_raw_id",
    }).onDelete("set null"),
  ],
);

/**
 * Current state of one comment, projected from the newest `reddit_raw` row.
 *
 * `id` is Reddit's base36 comment id. It was previously typed `uuid`, which no
 * Reddit id has ever matched — the column could not have held real data.
 */
export const reddit_comment = schema.table(
  "reddit_comment",
  {
    id: text("id").primaryKey(),
    post_id: text("post_id").notNull(),
    /**
     * Fullname of the parent — `t1_…` for a reply, `t3_…` for a top-level
     * comment. Kept as the raw fullname rather than a self-FK because the tree
     * is never walked; the resolver only cares which post a body belongs to.
     */
    parent_id: text("parent_id"),
    author: text("author"),
    body: text("body"),
    created_utc: timestamp("created_utc", { withTimezone: true }),
    score: integer("score"),
    removed: boolean("removed"),
    raw_id: bigint("raw_id", { mode: "number" }),
  },
  (table) => [
    index("idx_reddit_comment_post_id").on(table.post_id),
    foreignKey({
      columns: [table.post_id],
      foreignColumns: [reddit_post.id],
      name: "reddit_comment_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.raw_id],
      foreignColumns: [reddit_raw.id],
      name: "fk_reddit_comment_raw_id",
    }).onDelete("set null"),
  ],
);

/**
 * One candidate image URL found in a post or comment, and the handoff point to
 * the downloader that does not exist yet.
 *
 * The download step is deliberately not part of this pipeline. Everything here
 * is derived from local data by a pure function, so the table can be rebuilt at
 * will; a downloader that mutated it in place would make that untrue. The future
 * fetcher's input is simply:
 *
 *   SELECT url, kind FROM image_candidate WHERE status = 'PENDING'
 *
 * *Every* URL found is recorded, including ones nothing will ever download.
 * Hosts we do not support are stored with a non-`PENDING` status rather than
 * dropped, so the host distribution stays queryable in SQL and adding support
 * later is an UPDATE rather than a re-crawl. That is how mediafire and mega
 * (~240 links, almost certainly cover packs rather than single images) are
 * parked: recorded as `archive`/`UNSUPPORTED`, invisible to the downloader,
 * one statement away from being queued.
 */
export const image_candidate = schema.table(
  "image_candidate",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    post_id: text("post_id").notNull(),
    /** Null when the URL came from the submission itself rather than a reply. */
    comment_id: text("comment_id"),
    /**
     * Canonicalised, not as-written.
     *
     * Signed `preview.redd.it` URLs are rewritten to their durable `i.redd.it`
     * form here. The signature in a preview URL expires, so storing one would
     * produce a table of links that quietly rot between resolve and download.
     */
    url: text("url").notNull(),
    host: text("host").notNull(),
    /** Routes to a download strategy: which fetcher, and whether it fans out. */
    kind: text("kind").notNull(),
    /** Position within a gallery or album, so ordering survives the download. */
    ordinal: integer("ordinal"),
    status: text("status").notNull().default("PENDING"),
    resolver_version: integer("resolver_version").notNull(),
    discovered_at: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set by the future downloader once the bytes have landed. */
    image_id: uuid("image_id"),
    last_error: text("last_error"),
  },
  (table) => [
    // NULLS NOT DISTINCT so that post-level candidates (comment_id IS NULL)
    // collide with themselves on re-resolve. Without it the default NULL
    // semantics make every re-run insert a fresh duplicate of every post-level
    // URL, which is precisely the case that re-resolving is built around.
    unique("uq_image_candidate_source_url")
      .on(table.post_id, table.comment_id, table.url)
      .nullsNotDistinct(),
    index("idx_image_candidate_status").on(table.status, table.kind),
    index("idx_image_candidate_post_id").on(table.post_id),
    check(
      "image_candidate_status",
      sql`${table.status} IN ('PENDING', 'UNSUPPORTED', 'IGNORED', 'DOWNLOADED', 'FAILED')`,
    ),
    foreignKey({
      columns: [table.post_id],
      foreignColumns: [reddit_post.id],
      name: "fk_image_candidate_post_id",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.comment_id],
      foreignColumns: [reddit_comment.id],
      name: "fk_image_candidate_comment_id",
    }).onDelete("cascade"),
  ],
);

/**
 * Singleton cursor for the incremental pollers.
 *
 * `/new` and `/r/<sub>/comments` are walked newest-first and stopped as soon as
 * a fullname we already hold appears, so the only state needed is a high-water
 * mark per stream. Kept in one row rather than derived from `max(created_utc)`
 * because a post can be *created* before the cursor and still arrive after it —
 * crossposts and approvals both do this — and a derived cursor would skip them
 * permanently.
 */
export const reddit_poll_cursor = schema.table("reddit_poll_cursor", {
  /** `posts` or `comments`. */
  stream: text("stream").primaryKey(),
  last_fullname: text("last_fullname"),
  last_polled_at: timestamp("last_polled_at", { withTimezone: true }),
  last_error: text("last_error"),
});

export const image = schema.table(
  "image",
  {
    id: uuid("id").primaryKey(),
    source: text("source"),
    reddit_post_id: text("reddit_post_id"),
    /**
     * Base36 Reddit comment id. Was `uuid`, which no Reddit id can satisfy; the
     * column was NULL on every row, so the retype loses nothing.
     */
    reddit_comment_id: text("reddit_comment_id"),
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
