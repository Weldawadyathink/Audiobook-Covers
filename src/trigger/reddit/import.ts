/**
 * One-shot orchestrator for a complete import.
 *
 * Each stage is independently runnable and resumable, so this exists only to
 * spare a human running four tasks in order. Re-running it is safe and cheap:
 * every stage filters to outstanding work, so a second run against a finished
 * import does nothing but four queries.
 *
 * Ingest only: this ends with a complete `reddit_post` and `reddit_comment`, and
 * does not download anything. Turning those into images is the archiver's job,
 * and it claims its own work by `archived_at IS NULL`.
 *
 * Expected cost of a cold full import, measured against the live subreddit:
 *   enumerate ids    ~35 Arctic Shift requests
 *   hydrate posts    ~35 Reddit requests (100 posts each)
 *   fetch comments  ~1,704 Reddit requests (one per post with replies)
 *   -> ~1,774 requests, about 18 minutes at Reddit's 100 QPM free tier.
 */
import { logger, task } from "@trigger.dev/sdk/v3";
import {
  enumeratePostIdsTask,
  fetchCommentsTask,
  hydratePostsTask,
} from "./backfill";

export const importSubredditTask = task({
  id: "reddit-import-subreddit",
  machine: "micro",
  maxDuration: 7200,
  run: async () => {
    const enumerated = await enumeratePostIdsTask.triggerAndWait({});
    if (!enumerated.ok) throw new Error("id enumeration failed");
    logger.info("enumerated post ids", enumerated.output);

    const hydrated = await hydratePostsTask.triggerAndWait({});
    if (!hydrated.ok) throw new Error("post hydration failed");
    logger.info("hydrated posts", hydrated.output);

    const comments = await fetchCommentsTask.triggerAndWait({});
    if (!comments.ok) throw new Error("comment fetch failed");
    logger.info("fetched comments", comments.output);

    return {
      enumerated: enumerated.output,
      hydrated: hydrated.output,
      comments: comments.output,
    };
  },
});
