/**
 * Writing into `reddit_raw`, and projecting out of it.
 *
 * Every network path in the import funnels through `archiveThings`, and every
 * typed row in `reddit_post`/`reddit_comment` is produced by `projectPosts`/
 * `projectComments` reading rows back out. Nothing else writes those tables.
 * Keeping that rule is what makes the pipeline replayable: drop the projections,
 * run them again, and the catalogue rebuilds from disk with no network at all.
 */
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { schemaName } from "@/db/schema";
import type { RedditThing } from "./client";

export type RawSource = "reddit_api" | "arctic_shift";

type Sql = ReturnType<typeof postgres>;

/**
 * Volatile fields, excluded from the payload hash.
 *
 * Score and comment count drift on essentially every post on every poll. Hashing
 * them would defeat deduplication entirely — a daily poll of 3,494 posts would
 * archive 3,494 new rows every day, none recording a change anyone cares about.
 * The current values still reach `reddit_post` through the projection; they just
 * do not constitute a new version of the thing.
 */
const VOLATILE_KEYS = new Set([
  "score",
  "ups",
  "downs",
  "upvote_ratio",
  "num_comments",
  "num_crossposts",
  "view_count",
  "created",
  "subreddit_subscribers",
  "total_awards_received",
  "likes",
  "saved",
  "clicked",
  "visited",
  "hide_score",
  "user_reports",
  "mod_reports",
]);

/**
 * Stable JSON with volatile keys stripped and object keys sorted.
 *
 * Key order has to be normalised because Reddit does not guarantee it, and an
 * unordered `JSON.stringify` would hash identical content differently between
 * two responses.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value === null || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (VOLATILE_KEYS.has(key)) continue;
    out[key] = canonicalise(source[key]);
  }
  return out;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalise(payload)))
    .digest("hex");
}

/** Reddit `kind` prefix → our archive kind. Anything else is not archived. */
const KIND_BY_PREFIX: Record<string, "post" | "comment"> = {
  t3: "post",
  t1: "comment",
};

export interface ArchiveResult {
  seen: number;
  /** Fullnames whose content actually changed — the projection's work list. */
  changed: string[];
}

/**
 * Append things to the archive, skipping any whose content is unchanged.
 *
 * Returns the fullnames that were genuinely new so callers can scope the
 * projection to them instead of reprojecting the whole subreddit.
 */
export async function archiveThings(
  sql: Sql,
  things: RedditThing[],
  source: RawSource,
): Promise<ArchiveResult> {
  const rows = things.flatMap((thing) => {
    const kind = KIND_BY_PREFIX[thing.kind];
    const name = (thing.data as { name?: unknown }).name;
    if (!kind || typeof name !== "string") return [];
    return [
      [
        name,
        kind,
        source,
        JSON.stringify(thing.data),
        hashPayload(thing.data),
      ] as const,
    ];
  });

  if (rows.length === 0) return { seen: things.length, changed: [] };

  // ON CONFLICT against uq_reddit_raw_fullname_hash is the deduplication.
  const inserted = (await sql`
    INSERT INTO ${sql(schemaName)}.reddit_raw
      (fullname, kind, source, payload, payload_hash)
    SELECT v.fullname, v.kind, v.source, v.payload::jsonb, v.payload_hash
    FROM (VALUES ${sql(rows.map((row) => [...row]))})
      AS v(fullname, kind, source, payload, payload_hash)
    ON CONFLICT (fullname, payload_hash) DO NOTHING
    RETURNING fullname
  `) as unknown as { fullname: string }[];

  return {
    seen: things.length,
    changed: inserted.map((row) => row.fullname),
  };
}

/**
 * Rebuild `reddit_post` from the newest archive row for each post.
 *
 * `fullnames` scopes the work to things just archived. Passing null reprojects
 * every post in the archive, which is the replay-from-scratch path.
 */
export async function projectPosts(sql: Sql, fullnames: string[] | null) {
  const all = fullnames === null;
  await sql`
    WITH latest AS (
      SELECT DISTINCT ON (r.fullname) r.id, r.fullname, r.payload
      FROM ${sql(schemaName)}.reddit_raw r
      WHERE r.kind = 'post'
        AND (${all} OR r.fullname = ANY(${fullnames ?? []}::text[]))
      ORDER BY r.fullname, r.fetched_at DESC, r.id DESC
    )
    INSERT INTO ${sql(schemaName)}.reddit_post AS p (
      id, title, body, author, flair, permalink, url, created_utc,
      is_gallery, over_18, removed, score, num_comments, hydrated_at, raw_id
    )
    SELECT
      substring(latest.fullname from 4),
      payload->>'title',
      nullif(payload->>'selftext', ''),
      nullif(payload->>'author', '[deleted]'),
      payload->>'link_flair_text',
      payload->>'permalink',
      payload->>'url',
      to_timestamp((payload->>'created_utc')::double precision),
      coalesce((payload->>'is_gallery')::boolean, false),
      coalesce((payload->>'over_18')::boolean, false),
      -- Reddit signals removal three different ways and uses none of them
      -- consistently, so treat any of them as removed.
      (payload->>'removed_by_category') IS NOT NULL
        OR coalesce((payload->>'removed')::boolean, false)
        OR payload->>'selftext' IN ('[removed]', '[deleted]'),
      (payload->>'score')::int,
      (payload->>'num_comments')::int,
      now(),
      latest.id
    FROM latest
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      author = EXCLUDED.author,
      flair = EXCLUDED.flair,
      permalink = EXCLUDED.permalink,
      url = EXCLUDED.url,
      created_utc = EXCLUDED.created_utc,
      is_gallery = EXCLUDED.is_gallery,
      over_18 = EXCLUDED.over_18,
      removed = EXCLUDED.removed,
      score = EXCLUDED.score,
      num_comments = EXCLUDED.num_comments,
      hydrated_at = now(),
      raw_id = EXCLUDED.raw_id,
      -- A new archive row means the content changed, so anything derived from
      -- it is stale. Nulling the version is what re-queues it for resolution.
      resolver_version = CASE
        WHEN p.raw_id IS DISTINCT FROM EXCLUDED.raw_id THEN NULL
        ELSE p.resolver_version
      END
  `;
}

/**
 * Rebuild `reddit_comment` from the archive.
 *
 * Comments whose post is absent from `reddit_post` are skipped rather than
 * failing the batch — the `/r/<sub>/comments` poller sees replies to posts the
 * id enumeration has not reached yet, and losing one comment to a later re-run
 * beats stalling the poller on a foreign key.
 */
export async function projectComments(sql: Sql, fullnames: string[] | null) {
  const all = fullnames === null;
  await sql`
    WITH latest AS (
      SELECT DISTINCT ON (r.fullname) r.id, r.fullname, r.payload
      FROM ${sql(schemaName)}.reddit_raw r
      WHERE r.kind = 'comment'
        AND (${all} OR r.fullname = ANY(${fullnames ?? []}::text[]))
      ORDER BY r.fullname, r.fetched_at DESC, r.id DESC
    )
    INSERT INTO ${sql(schemaName)}.reddit_comment AS c (
      id, post_id, parent_id, author, body, created_utc, score, removed, raw_id
    )
    SELECT
      substring(latest.fullname from 4),
      substring(payload->>'link_id' from 4),
      payload->>'parent_id',
      nullif(payload->>'author', '[deleted]'),
      payload->>'body',
      to_timestamp((payload->>'created_utc')::double precision),
      (payload->>'score')::int,
      payload->>'body' IN ('[removed]', '[deleted]'),
      latest.id
    FROM latest
    WHERE EXISTS (
      SELECT 1 FROM ${sql(schemaName)}.reddit_post p
      WHERE p.id = substring(latest.payload->>'link_id' from 4)
    )
    ON CONFLICT (id) DO UPDATE SET
      post_id = EXCLUDED.post_id,
      parent_id = EXCLUDED.parent_id,
      author = EXCLUDED.author,
      body = EXCLUDED.body,
      created_utc = EXCLUDED.created_utc,
      score = EXCLUDED.score,
      removed = EXCLUDED.removed,
      raw_id = EXCLUDED.raw_id
  `;

  // A changed comment invalidates its post's resolved links exactly as a
  // changed post body does — the resolver reads both together.
  await sql`
    UPDATE ${sql(schemaName)}.reddit_post p
    SET resolver_version = NULL
    FROM ${sql(schemaName)}.reddit_comment c
    WHERE c.post_id = p.id
      AND p.resolver_version IS NOT NULL
      AND (${all} OR c.id = ANY(${
        fullnames?.map((name) => name.slice(3)) ?? []
      }::text[]))
  `;
}
