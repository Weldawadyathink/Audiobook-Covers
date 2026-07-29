/**
 * Incremental sync: what keeps the catalogue current once the backfill is done.
 *
 * Two streams, not one. `/new` catches submissions, but a comment can land on a
 * two-year-old post long after it has scrolled off any listing — and comments
 * are where this subreddit's off-site image links overwhelmingly live (498 posts
 * carry image-bearing replies). Polling submissions alone is how a catalogue
 * silently drifts out of date while appearing to work.
 *
 * At roughly two posts and three comments a day, both streams together cost two
 * requests per run.
 */
import { schedules, logger } from "@trigger.dev/sdk/v3";
import { createPostgresWriteDb } from "@/db.node";
import { schemaName } from "@/db/schema";
import { RedditClient, type RedditThing } from "./client";
import { archiveThings, projectComments, projectPosts } from "./archive";

const SUBREDDIT = "audiobookcovers";

/**
 * How far to keep walking after the first already-seen thing.
 *
 * Stopping at the very first known fullname is wrong: Reddit's listings are not
 * strictly append-only — an approved or crossposted item appears mid-listing
 * below things already collected. Overshooting by a page absorbs that without
 * paying for a full walk.
 */
const OVERSHOOT = 100;

type Stream = "posts" | "comments";

async function readCursor(
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  stream: Stream,
) {
  const rows = (await sql`
    SELECT last_fullname FROM ${sql(schemaName)}.reddit_poll_cursor
    WHERE stream = ${stream}
  `) as unknown as { last_fullname: string | null }[];
  return rows[0]?.last_fullname ?? null;
}

async function writeCursor(
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  stream: Stream,
  fullname: string | null,
) {
  // The target table is referenced unqualified in DO UPDATE; a schema-qualified
  // name is not accepted there. Callers already pass `newest ?? cursor`, so the
  // incoming value is only null when there is genuinely nothing to remember.
  await sql`
    INSERT INTO ${sql(schemaName)}.reddit_poll_cursor
      (stream, last_fullname, last_polled_at)
    VALUES (${stream}, ${fullname}, now())
    ON CONFLICT (stream) DO UPDATE SET
      last_fullname = coalesce(EXCLUDED.last_fullname, reddit_poll_cursor.last_fullname),
      last_polled_at = now(),
      last_error = NULL
  `;
}

/**
 * Walk a listing until the cursor is reached, then `OVERSHOOT` items further.
 *
 * A null cursor means "first ever run"; the walk is bounded to one page rather
 * than paging to the 1,000-item ceiling, because the historical backfill owns
 * everything older and duplicating that work here would be pointless.
 */
async function collectNew(
  client: RedditClient,
  path: string,
  cursor: string | null,
): Promise<RedditThing[]> {
  const collected: RedditThing[] = [];
  let seenCursor = false;
  let sinceCursor = 0;

  for await (const thing of client.listing(path, () => false)) {
    const name = (thing.data as { name?: string }).name;

    if (cursor === null && collected.length >= 100) break;

    if (name === cursor) {
      seenCursor = true;
    } else if (!seenCursor) {
      collected.push(thing);
    }

    if (seenCursor) {
      sinceCursor++;
      if (sinceCursor >= OVERSHOOT) break;
    }
  }

  return collected;
}

export const pollNewPostsTask = schedules.task({
  id: "reddit-poll-new-posts",
  // 06:00 UTC daily. The subreddit posts a couple of items a day; anything more
  // frequent spends requests to discover nothing.
  cron: "0 6 * * *",
  machine: "micro",
  maxDuration: 900,
  run: async () => {
    const { sql } = createPostgresWriteDb({
      application_name: "reddit-poll-new-posts",
    });
    const client = new RedditClient();

    const cursor = await readCursor(sql, "posts");
    const things = await collectNew(client, `/r/${SUBREDDIT}/new`, cursor);
    logger.info(`found ${things.length} new posts`);

    if (things.length > 0) {
      const { changed } = await archiveThings(sql, things, "reddit_api");
      // Project all of them, not only changed ones — an unchanged post that is
      // new to us still has no `reddit_post` row.
      await projectPosts(
        sql,
        things.map((thing) => (thing.data as { name: string }).name),
      );
      logger.info(`archived ${changed} changed payloads`);
    }

    const newest = (things[0]?.data as { name?: string } | undefined)?.name;
    await writeCursor(sql, "posts", newest ?? cursor);

    await sql.end();
    return { found: things.length, redditRequests: client.requestsMade };
  },
});

/**
 * Catch comments on posts of any age.
 *
 * `/r/<sub>/comments` is the subreddit-wide firehose, newest first, which is the
 * only way to notice a reply to an old post without re-polling every post.
 * New comments arriving on posts we have never enumerated are archived anyway
 * and projected later — `projectComments` skips rows whose post is missing, and
 * the next backfill pass picks them up.
 */
export const pollNewCommentsTask = schedules.task({
  id: "reddit-poll-new-comments",
  cron: "20 6 * * *",
  machine: "micro",
  maxDuration: 900,
  run: async () => {
    const { sql } = createPostgresWriteDb({
      application_name: "reddit-poll-new-comments",
    });
    const client = new RedditClient();

    const cursor = await readCursor(sql, "comments");
    const things = await collectNew(client, `/r/${SUBREDDIT}/comments`, cursor);
    logger.info(`found ${things.length} new comments`);

    if (things.length > 0) {
      await archiveThings(sql, things, "reddit_api");
      await projectComments(
        sql,
        things.map((thing) => (thing.data as { name: string }).name),
      );
    }

    const newest = (things[0]?.data as { name?: string } | undefined)?.name;
    await writeCursor(sql, "comments", newest ?? cursor);

    await sql.end();
    return { found: things.length, redditRequests: client.requestsMade };
  },
});
