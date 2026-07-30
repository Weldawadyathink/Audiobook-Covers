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
import { createPostgresWriteDb, textArray } from "@/db.node";
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

/** First-ever run: one page, because the backfill owns everything older. */
const FIRST_RUN_PAGE = 100;

/**
 * Hard stop for a walk that never finds its cursor.
 *
 * The remembered fullname can be deleted, and a deleted thing is gone from the
 * listing — so without a bound the walk runs to Reddit's 1,000-item ceiling
 * every single night looking for something that no longer exists. At two posts a
 * day this limit is still months of history.
 */
const MAX_WALK = 300;

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
 * Walk a listing to the cursor, then `OVERSHOOT` items further, collecting
 * everything seen along the way.
 *
 * Items at and below the cursor are collected, not merely counted. That is the
 * entire point of overshooting: a crosspost or a newly approved submission
 * appears *below* fullnames the previous run already recorded, so the window
 * past the cursor is precisely where the things it could not have seen are. An
 * earlier version counted those hundred items without keeping them, which threw
 * away the case the overshoot exists for.
 *
 * Collecting things we already hold costs nothing. `archiveThings` dedupes on
 * the payload hash, so an unchanged thing is a no-op insert, and re-projecting a
 * hundred fullnames is one statement — much cheaper than the arithmetic needed
 * to decide which side of the cursor an item really belongs on.
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
  /** Null until the cursor turns up, then counts the items past it. */
  let sinceCursor: number | null = null;

  for await (const thing of client.listing(path, () => false)) {
    collected.push(thing);

    if (cursor === null) {
      if (collected.length >= FIRST_RUN_PAGE) break;
      continue;
    }

    if ((thing.data as { name?: string }).name === cursor) sinceCursor = 0;
    else if (sinceCursor !== null) sinceCursor += 1;

    if (sinceCursor !== null) {
      if (sinceCursor >= OVERSHOOT) break;
      // `MAX_WALK` is not checked once the cursor is in hand: finishing the
      // overshoot matters more than the bound, and it is only ever exceeded by
      // one page.
      continue;
    }

    if (collected.length >= MAX_WALK) {
      logger.warn(
        `cursor ${cursor} not found in ${path} within ${MAX_WALK} items; ` +
          `it was most likely deleted`,
      );
      break;
    }
  }

  return collected;
}

/**
 * Give every post referenced by a batch of comments a `reddit_post` row.
 *
 * `/r/<sub>/comments` is a firehose: it returns replies to submissions this
 * pipeline may never have enumerated, and `projectComments` skips any comment
 * whose post is missing so the foreign key stays satisfiable. That skip was
 * silent and permanent — the archive row existed, so a later fetch saw no
 * change and nothing ever went back for it. Inserting a bare stub is exactly
 * what `reddit-enumerate-post-ids` does, so the comment projects immediately and
 * the post lands in the hydration queue with `hydrated_at IS NULL`.
 */
async function ensurePostStubs(
  sql: ReturnType<typeof createPostgresWriteDb>["sql"],
  things: RedditThing[],
): Promise<number> {
  const postIds = [
    ...new Set(
      things.flatMap((thing) => {
        const linkId = (thing.data as { link_id?: unknown }).link_id;
        return typeof linkId === "string" && linkId.startsWith("t3_")
          ? [linkId.slice(3)]
          : [];
      }),
    ),
  ];
  if (postIds.length === 0) return 0;

  const inserted = (await sql`
    INSERT INTO ${sql(schemaName)}.reddit_post (id)
    SELECT * FROM unnest(${textArray(postIds)}::text[])
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as unknown as { id: string }[];

  return inserted.length;
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

    if (things.length > 0) {
      await projectPosts(sql, await archiveThings(sql, things, "reddit_api"));
    }

    // `walked` is not "how many are new": the overshoot deliberately re-walks a
    // page of things already held, and re-archiving them is a no-op upsert.
    logger.info(`walked ${things.length} posts`);

    const newest = (things[0]?.data as { name?: string } | undefined)?.name;
    await writeCursor(sql, "posts", newest ?? cursor);

    await sql.end();
    return { walked: things.length, redditRequests: client.requestsMade };
  },
});

/**
 * Catch comments on posts of any age.
 *
 * `/r/<sub>/comments` is the subreddit-wide firehose, newest first, which is the
 * only way to notice a reply to an old post without re-polling every post.
 * Comments arriving on posts we have never enumerated get a post stub written
 * for them first, so they project straight away instead of being skipped on the
 * foreign key and forgotten.
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

    let stubs = 0;
    if (things.length > 0) {
      const archived = await archiveThings(sql, things, "reddit_api");
      // Stubs before projection: `projectComments` drops any comment whose post
      // is missing, and nothing ever revisits the ones it drops.
      stubs = await ensurePostStubs(sql, things);
      await projectComments(sql, archived);
    }

    logger.info(
      `walked ${things.length} comments, ${stubs} unknown posts stubbed`,
    );

    const newest = (things[0]?.data as { name?: string } | undefined)?.name;
    await writeCursor(sql, "comments", newest ?? cursor);

    await sql.end();
    return {
      walked: things.length,
      postStubs: stubs,
      redditRequests: client.requestsMade,
    };
  },
});
