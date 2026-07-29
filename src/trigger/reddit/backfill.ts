/**
 * Historical backfill: enumerate every post id that has ever existed, then
 * hydrate each one from the Reddit API.
 *
 * The split exists because Reddit cannot enumerate its own history. Every
 * listing endpoint stops at 1,000 items and this subreddit has ~3,500 posts, so
 * `/new` and `/top` together cannot reach the first three years. `/api/info`
 * has no such ceiling — given an id it returns live data — so the only thing
 * missing is a complete id list, and that is all Arctic Shift is used for.
 *
 * Post *content* always comes from Reddit.
 */
import { schemaTask, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createPostgresWriteDb, textArray } from "@/db.node";
import { schemaName } from "@/db/schema";
import { env } from "@/env.node";
import { RedditClient } from "./client";
import { rateLimitedFetch } from "./http";
import { archiveThings, projectComments, projectPosts } from "./archive";

const SUBREDDIT = "audiobookcovers";
const ARCTIC_SHIFT_BASE = "https://arctic-shift.photon-reddit.com/api";

/** Arctic Shift rejects anything above 100 with a 400. */
const ARCTIC_SHIFT_PAGE = 100;
/** `/api/info` accepts at most 100 fullnames per call. */
const INFO_BATCH = 100;

/** Subreddit creation, minus a day. Nothing can predate this. */
const EPOCH = 1601127871;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every post id the subreddit has ever had, oldest first.
 *
 * Paged on `created_utc` rather than an opaque cursor, so a failure mid-walk
 * resumes from a timestamp instead of restarting. Arctic Shift 403s without a
 * descriptive User-Agent.
 */
async function* enumeratePostIds(): AsyncGenerator<string[]> {
  let after = EPOCH;
  const seen = new Set<string>();

  for (;;) {
    const url = new URL(`${ARCTIC_SHIFT_BASE}/posts/search`);
    url.search = new URLSearchParams({
      subreddit: SUBREDDIT,
      limit: String(ARCTIC_SHIFT_PAGE),
      sort: "asc",
      after: String(after),
      fields: "id,created_utc",
    }).toString();

    // Arctic Shift computes limits dynamically from server load rather than
    // publishing a fixed budget, so there is no remaining-quota header to pace
    // against — a 429 is the only signal, and its reset headers say when to
    // resume. It is a free volunteer-run archive; the polite reading of those
    // headers is the whole rate-limit strategy.
    const response = await rateLimitedFetch(
      url,
      { headers: { "User-Agent": env.REDDIT_USER_AGENT } },
      { label: "arctic-shift" },
    );
    if (!response.ok) {
      throw new Error(
        `Arctic Shift ${response.status}: ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      data: { id: string; created_utc: number }[] | null;
    };
    const page = body.data ?? [];
    if (page.length === 0) return;

    const fresh = page.filter((row) => !seen.has(row.id));
    for (const row of fresh) seen.add(row.id);
    if (fresh.length > 0) yield fresh.map((row) => row.id);

    const newest = Math.max(...page.map((row) => row.created_utc));
    // Several posts can share a second; step forward only once the whole page
    // is already known, otherwise the tail of that second would be skipped.
    after = newest > after ? newest : after + 1;

    await sleep(250);
  }
}

/**
 * Insert bare id stubs. `hydrated_at IS NULL` is then the hydration work queue.
 *
 * Existing rows are left completely alone — re-running enumeration must not
 * reset hydration or resolution state, or every run would redo the whole import.
 */
export const enumeratePostIdsTask = schemaTask({
  id: "reddit-enumerate-post-ids",
  schema: z.object({}).default({}),
  machine: "micro",
  maxDuration: 1800,
  run: async () => {
    const { sql } = createPostgresWriteDb({
      application_name: "reddit-enumerate-post-ids",
    });

    let discovered = 0;
    let added = 0;

    for await (const ids of enumeratePostIds()) {
      discovered += ids.length;
      const inserted = (await sql`
        INSERT INTO ${sql(schemaName)}.reddit_post (id)
        SELECT * FROM unnest(${textArray(ids)}::text[])
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `) as unknown as { id: string }[];
      added += inserted.length;
      logger.info(`enumerated ${discovered}, new ${added}`);
    }

    await sql.end();
    return { discovered, added };
  },
});

/**
 * Hydrate posts from Reddit, 100 per request.
 *
 * Ordered by `hydrated_at NULLS FIRST` so a fresh backfill drains the never-seen
 * queue, and once that is empty the same task doubles as the refresh sweep,
 * revisiting the stalest posts to pick up edits, deletions and removals.
 */
export const hydratePostsTask = schemaTask({
  id: "reddit-hydrate-posts",
  schema: z.object({
    /** Cap per run. 3,500 posts is 35 requests, so the default covers a full backfill. */
    limit: z.number().int().positive().default(4000),
    /** When false, only posts never hydrated are considered. */
    includeRefresh: z.boolean().default(false),
  }),
  machine: "micro",
  maxDuration: 3600,
  run: async ({ limit, includeRefresh }) => {
    const { sql } = createPostgresWriteDb({
      application_name: "reddit-hydrate-posts",
    });
    const client = new RedditClient();

    const pending = (await sql`
      SELECT id FROM ${sql(schemaName)}.reddit_post
      WHERE ${includeRefresh} OR hydrated_at IS NULL
      ORDER BY hydrated_at ASC NULLS FIRST, id
      LIMIT ${limit}
    `) as unknown as { id: string }[];

    logger.info(`hydrating ${pending.length} posts`);

    let changed = 0;
    for (let i = 0; i < pending.length; i += INFO_BATCH) {
      const batch = pending.slice(i, i + INFO_BATCH);
      const things = await client.info(batch.map((row) => `t3_${row.id}`));

      const result = await archiveThings(sql, things, "reddit_api");
      changed += result.changed.length;

      // Project every id in the batch, not just changed ones: a post that came
      // back byte-identical still needs `hydrated_at` advanced, or it stays at
      // the head of the queue forever and the sweep never moves on.
      await projectPosts(
        sql,
        batch.map((row) => `t3_${row.id}`),
      );

      // Reddit silently omits deleted submissions from /api/info rather than
      // erroring. Without this they would keep NULL hydrated_at and be retried
      // on every run for the rest of time.
      if (things.length < batch.length) {
        const returned = new Set(
          things.map((thing) => (thing.data as { name?: string }).name),
        );
        const missing = batch
          .map((row) => row.id)
          .filter((id) => !returned.has(`t3_${id}`));
        if (missing.length > 0) {
          await sql`
            UPDATE ${sql(schemaName)}.reddit_post
            SET hydrated_at = now(), removed = true
            WHERE id = ANY(${textArray(missing)}::text[])
          `;
          logger.warn(`${missing.length} posts absent from Reddit`, {
            missing,
          });
        }
      }

      logger.info(
        `hydrated ${Math.min(i + INFO_BATCH, pending.length)}/${pending.length}`,
      );
    }

    await sql.end();
    return {
      posts: pending.length,
      changed,
      redditRequests: client.requestsMade,
    };
  },
});

/**
 * Fetch comment trees, one request per post.
 *
 * This is the expensive stage — one call per post rather than 100 — so it is
 * filtered to posts Reddit says actually have comments. The busiest post in this
 * subreddit's history has 37 comments, well under the point where Reddit
 * truncates a tree, so no `morechildren` expansion is needed.
 */
export const fetchCommentsTask = schemaTask({
  id: "reddit-fetch-comments",
  schema: z.object({
    limit: z.number().int().positive().default(2000),
    /** Refetch posts whose comments were already collected. */
    includeRefresh: z.boolean().default(false),
  }),
  machine: "micro",
  maxDuration: 3600,
  run: async ({ limit, includeRefresh }) => {
    const { sql } = createPostgresWriteDb({
      application_name: "reddit-fetch-comments",
    });
    const client = new RedditClient();

    const pending = (await sql`
      SELECT id FROM ${sql(schemaName)}.reddit_post
      WHERE hydrated_at IS NOT NULL
        AND coalesce(num_comments, 0) > 0
        AND (${includeRefresh} OR comments_fetched_at IS NULL)
      ORDER BY comments_fetched_at ASC NULLS FIRST, created_utc DESC
      LIMIT ${limit}
    `) as unknown as { id: string }[];

    logger.info(`fetching comments for ${pending.length} posts`);

    let archived = 0;
    for (const [index, post] of pending.entries()) {
      const things = await client.comments(post.id);
      const result = await archiveThings(sql, things, "reddit_api");
      archived += result.changed.length;

      if (result.changed.length > 0) {
        await projectComments(sql, result.changed);
      }
      await sql`
        UPDATE ${sql(schemaName)}.reddit_post
        SET comments_fetched_at = now()
        WHERE id = ${post.id}
      `;

      if ((index + 1) % 100 === 0) {
        logger.info(`comments ${index + 1}/${pending.length}`);
      }
    }

    await sql.end();
    return {
      posts: pending.length,
      commentsArchived: archived,
      redditRequests: client.requestsMade,
    };
  },
});
