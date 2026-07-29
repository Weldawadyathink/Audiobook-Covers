/**
 * The resolve stage: local rows in, `image_candidate` rows out.
 *
 * Touches no network. Its entire input is `reddit_post` + `reddit_comment`, so
 * it can be re-run over the whole subreddit at any time — which is the point of
 * archiving raw payloads in the first place. Bump `RESOLVER_VERSION`, run this,
 * and six years of history are re-extracted against the new rules in seconds.
 */
import { schemaTask, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createPostgresWriteDb, textArray } from "@/db.node";
import { schemaName } from "@/db/schema";
import {
  RESOLVER_VERSION,
  resolvePost,
  type Candidate,
  type ResolvableComment,
} from "./resolve";

/** Posts per transaction. Keeps one bad post from rolling back thousands. */
const BATCH = 200;

interface PostRow {
  id: string;
  body: string | null;
  url: string | null;
  gallery_data: unknown;
  media_metadata: unknown;
}

async function writeCandidates(
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  postIds: string[],
  candidates: Candidate[],
) {
  // Clear first so URLs removed by an edit, or reclassified by new rules, do
  // not linger. Rows the downloader has already claimed are kept: deleting a
  // DOWNLOADED row would orphan the image it points at, and re-inserting it as
  // PENDING would queue a second download of bytes already held.
  await sql`
    DELETE FROM ${sql(schemaName)}.image_candidate
    WHERE post_id = ANY(${textArray(postIds)}::text[])
      AND status IN ('PENDING', 'UNSUPPORTED', 'IGNORED')
  `;

  if (candidates.length === 0) return;

  await sql`
    INSERT INTO ${sql(schemaName)}.image_candidate
      (post_id, comment_id, url, host, kind, ordinal, status, resolver_version)
    SELECT
      source.post_id,
      source.comment_id,
      source.url,
      source.host,
      source.kind,
      source.ordinal::int,
      source.status,
      ${RESOLVER_VERSION}
    FROM (VALUES ${sql(
      // postgres-js types the VALUES helper as non-nullable, but sends NULL
      // correctly at runtime. `comment_id` and `ordinal` are both legitimately
      // null — a post-level candidate has no comment and no gallery position.
      candidates.map((candidate) => [
        candidate.post_id,
        candidate.comment_id,
        candidate.url,
        candidate.host,
        candidate.kind,
        candidate.ordinal,
        candidate.status,
      ]) as unknown as (string | number)[][],
    )}) AS source(post_id, comment_id, url, host, kind, ordinal, status)
    ON CONFLICT (post_id, comment_id, url) DO UPDATE SET
      host = EXCLUDED.host,
      kind = EXCLUDED.kind,
      ordinal = EXCLUDED.ordinal,
      status = EXCLUDED.status,
      resolver_version = EXCLUDED.resolver_version
  `;
}

export const resolveLinksTask = schemaTask({
  id: "reddit-resolve-links",
  schema: z.object({
    limit: z.number().int().positive().default(10_000),
    /** Re-resolve everything, ignoring `resolver_version`. */
    force: z.boolean().default(false),
  }),
  machine: "micro",
  maxDuration: 3600,
  run: async ({ limit, force }) => {
    const { sql } = createPostgresWriteDb({
      application_name: "reddit-resolve-links",
    });

    // `resolver_version IS NULL` covers both never-resolved posts and posts
    // whose content changed — the projection nulls it on every new archive row.
    const pending = (await sql`
      SELECT
        p.id,
        p.body,
        p.url,
        r.payload->'gallery_data'   AS gallery_data,
        r.payload->'media_metadata' AS media_metadata
      FROM ${sql(schemaName)}.reddit_post p
      LEFT JOIN ${sql(schemaName)}.reddit_raw r ON r.id = p.raw_id
      WHERE p.hydrated_at IS NOT NULL
        AND (${force}
             OR p.resolver_version IS NULL
             OR p.resolver_version < ${RESOLVER_VERSION})
      ORDER BY p.created_utc DESC NULLS LAST
      LIMIT ${limit}
    `) as unknown as PostRow[];

    logger.info(`resolving ${pending.length} posts at v${RESOLVER_VERSION}`);
    if (pending.length === 0) {
      await sql.end();
      return { posts: 0, candidates: 0 };
    }

    let written = 0;
    const byStatus = new Map<string, number>();

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const ids = batch.map((post) => post.id);

      const commentRows = (await sql`
        SELECT id, post_id, body FROM ${sql(schemaName)}.reddit_comment
        WHERE post_id = ANY(${textArray(ids)}::text[])
      `) as unknown as { id: string; post_id: string; body: string | null }[];

      const commentsByPost = new Map<string, ResolvableComment[]>();
      for (const row of commentRows) {
        const list = commentsByPost.get(row.post_id) ?? [];
        list.push({ id: row.id, body: row.body });
        commentsByPost.set(row.post_id, list);
      }

      const candidates = batch.flatMap((post) =>
        resolvePost(post, commentsByPost.get(post.id) ?? []),
      );
      for (const candidate of candidates) {
        byStatus.set(
          candidate.status,
          (byStatus.get(candidate.status) ?? 0) + 1,
        );
      }

      await writeCandidates(sql, ids, candidates);
      await sql`
        UPDATE ${sql(schemaName)}.reddit_post
        SET resolver_version = ${RESOLVER_VERSION}
        WHERE id = ANY(${textArray(ids)}::text[])
      `;

      written += candidates.length;
      logger.info(
        `resolved ${Math.min(i + BATCH, pending.length)}/${pending.length}`,
      );
    }

    await sql.end();
    return {
      posts: pending.length,
      candidates: written,
      byStatus: Object.fromEntries(byStatus),
    };
  },
});
