/**
 * Writing into `reddit_raw`, and projecting out of it.
 *
 * Every network path in the import funnels through `archiveThings`, and every
 * typed row in `reddit_post`/`reddit_comment` is produced by `projectPosts`/
 * `projectComments` reading rows back out. Nothing else writes those tables.
 * Keeping that rule is what makes the pipeline replayable: drop the projections,
 * run them again, and the ingest side rebuilds from disk with no network at all.
 */
import type postgres from "postgres";
import { textArray } from "@/db.node";
import { schemaName } from "@/db/schema";
import type { RedditThing } from "./client";

export type RawSource = "reddit_api" | "arctic_shift";

type Sql = ReturnType<typeof postgres>;

/** Reddit `kind` prefix → our archive kind. Anything else is not archived. */
const KIND_BY_PREFIX: Record<string, "post" | "comment"> = {
  t3: "post",
  t1: "comment",
};

/**
 * Upsert things into the archive, newest payload wins.
 *
 * Takes Reddit `Thing`s, which carry prefixed fullnames, and stores bare base36
 * ids — the prefix becomes `kind`, and the two together are the primary key.
 * Returns those bare ids, which is the projection's work list.
 *
 * Note it returns every id *seen*, not some subset that changed. `reddit_raw`
 * holds current state rather than history, so "did this payload differ from
 * last time" is not a question it can answer — and a projection scoped to
 * changes is a bug anyway, because a row can be missing from `reddit_post`
 * while its payload is perfectly current.
 */
export async function archiveThings(
  sql: Sql,
  things: RedditThing[],
  source: RawSource,
): Promise<string[]> {
  // Deduplicated because a single statement cannot update the same row twice:
  // Postgres rejects it with "ON CONFLICT DO UPDATE command cannot affect row a
  // second time". Overlapping listing pages make that reachable.
  const byKey = new Map<string, [string, string, RawSource, string]>();
  for (const thing of things) {
    const kind = KIND_BY_PREFIX[thing.kind];
    const name = (thing.data as { name?: unknown }).name;
    if (!kind || typeof name !== "string") continue;
    const id = name.slice(3);
    byKey.set(`${kind} ${id}`, [id, kind, source, JSON.stringify(thing.data)]);
  }

  const rows = [...byKey.values()];
  if (rows.length === 0) return [];

  await sql`
    INSERT INTO ${sql(schemaName)}.reddit_raw (reddit_id, kind, source, payload)
    SELECT v.reddit_id, v.kind, v.source, v.payload::jsonb
    FROM (VALUES ${sql(rows.map((row) => [...row]))})
      AS v(reddit_id, kind, source, payload)
    ON CONFLICT (reddit_id, kind) DO UPDATE SET
      source = EXCLUDED.source,
      payload = EXCLUDED.payload,
      fetched_at = now()
  `;

  return rows.map((row) => row[0]);
}

/**
 * Rebuild `reddit_post` from the archive.
 *
 * `ids` are bare base36 post ids, scoping the work to things just archived.
 * Passing null reprojects every post in the archive, which is the
 * replay-from-scratch path. Comment ids passed here match nothing: the `kind`
 * predicate is part of the key, not an afterthought.
 *
 * `archived_at` and `archiver_version` are never touched here. The archiver owns
 * them, and a post it has already finished with stays finished — re-projecting
 * is a local rebuild of derived columns, not a reason to re-download anything.
 */
export async function projectPosts(sql: Sql, ids: string[] | null) {
  const all = ids === null;
  await sql`
    INSERT INTO ${sql(schemaName)}.reddit_post (
      id, title, body, author, flair, permalink, url, created_utc,
      is_gallery, over_18, removed, score, num_comments, hydrated_at
    )
    SELECT
      r.reddit_id,
      r.payload->>'title',
      nullif(r.payload->>'selftext', ''),
      nullif(r.payload->>'author', '[deleted]'),
      r.payload->>'link_flair_text',
      r.payload->>'permalink',
      r.payload->>'url',
      to_timestamp((r.payload->>'created_utc')::double precision),
      coalesce((r.payload->>'is_gallery')::boolean, false),
      coalesce((r.payload->>'over_18')::boolean, false),
      -- Reddit signals removal three different ways and uses none of them
      -- consistently, so treat any of them as removed.
      (r.payload->>'removed_by_category') IS NOT NULL
        OR coalesce((r.payload->>'removed')::boolean, false)
        OR r.payload->>'selftext' IN ('[removed]', '[deleted]'),
      (r.payload->>'score')::int,
      (r.payload->>'num_comments')::int,
      now()
    FROM ${sql(schemaName)}.reddit_raw r
    WHERE r.kind = 'post'
      AND (${all} OR r.reddit_id = ANY(${textArray(ids ?? [])}::text[]))
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
      hydrated_at = now()
  `;
}

/**
 * Rebuild `reddit_comment` from the archive.
 *
 * Comments whose post is absent from `reddit_post` are skipped rather than
 * failing the batch — the `/r/<sub>/comments` poller sees replies to posts the
 * id enumeration has not reached yet. That skip is permanent, though, since
 * nothing revisits it: callers reading from the firehose must write post stubs
 * first. See `ensurePostStubs` in `poll.ts`.
 */
export async function projectComments(sql: Sql, ids: string[] | null) {
  const all = ids === null;
  await sql`
    INSERT INTO ${sql(schemaName)}.reddit_comment (
      id, post_id, parent_id, author, body, created_utc, score, removed
    )
    SELECT
      r.reddit_id,
      -- Still prefixed: link_id comes out of the Reddit payload, not out of
      -- our own column.
      substring(r.payload->>'link_id' from 4),
      r.payload->>'parent_id',
      nullif(r.payload->>'author', '[deleted]'),
      r.payload->>'body',
      to_timestamp((r.payload->>'created_utc')::double precision),
      (r.payload->>'score')::int,
      r.payload->>'body' IN ('[removed]', '[deleted]')
    FROM ${sql(schemaName)}.reddit_raw r
    WHERE r.kind = 'comment'
      AND (${all} OR r.reddit_id = ANY(${textArray(ids ?? [])}::text[]))
      AND EXISTS (
        SELECT 1 FROM ${sql(schemaName)}.reddit_post p
        WHERE p.id = substring(r.payload->>'link_id' from 4)
      )
    ON CONFLICT (id) DO UPDATE SET
      post_id = EXCLUDED.post_id,
      parent_id = EXCLUDED.parent_id,
      author = EXCLUDED.author,
      body = EXCLUDED.body,
      created_utc = EXCLUDED.created_utc,
      score = EXCLUDED.score,
      removed = EXCLUDED.removed
  `;
}
