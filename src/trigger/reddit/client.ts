/**
 * Reddit API access: app-only OAuth, rate limiting, and the three endpoints the
 * import uses.
 *
 * Deliberately app-only (`grant_type=client_credentials`) rather than a script
 * app authenticating as a user. Everything the import reads is public, so there
 * is no reason to hold a Reddit password in the secret store — and an app-only
 * token cannot vote, post or moderate even if it leaks.
 */
import { logger } from "@trigger.dev/sdk/v3";
import { env } from "@/env.node";
import { rateLimitedFetch } from "./http";

const OAUTH_BASE = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

/** Reddit's documented free-tier ceiling, per OAuth client. */
const QUERIES_PER_MINUTE = 100;
/**
 * Spacing between requests. Reddit averages its limit over a 10 minute window
 * and permits bursting, but a steady drip needs no burst budget and no recovery
 * logic, and the entire backfill still finishes in under twenty minutes.
 */
const MIN_REQUEST_INTERVAL_MS = 60_000 / QUERIES_PER_MINUTE;

/** Refresh this long before the token actually expires. */
const TOKEN_SKEW_MS = 60_000;

const MAX_ATTEMPTS = 5;

export interface RedditThing<T = Record<string, unknown>> {
  kind: string;
  data: T;
}

interface Listing<T = Record<string, unknown>> {
  kind: "Listing";
  data: {
    after: string | null;
    before: string | null;
    children: RedditThing<T>[];
  };
}

function isListing(value: unknown): value is Listing {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "Listing"
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One authenticated, self-throttling Reddit session.
 *
 * Holds the token and the rate limiter together because they are only correct
 * relative to each other — the quota Reddit reports is per client, so two
 * clients in one process would each think they had the full 100 QPM.
 */
export class RedditClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  /** Serialises requests; each link waits out the interval before firing. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;
  private requestCount = 0;

  get requestsMade() {
    return this.requestCount;
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_SKEW_MS) {
      return this.token;
    }

    const basic = Buffer.from(
      `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await rateLimitedFetch(
      OAUTH_BASE,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": env.REDDIT_USER_AGENT,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
      },
      { label: "reddit oauth" },
    );

    if (!response.ok) {
      throw new Error(
        `Reddit token request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = body.access_token;
    this.tokenExpiresAt = Date.now() + body.expires_in * 1000;
    return this.token;
  }

  /**
   * Issue one API request, throttled and retried.
   *
   * Retries cover 429 and 5xx. A 401 is treated as an expired token and retried
   * once with a fresh one — Reddit occasionally invalidates early, and the
   * alternative is a whole backfill dying twenty minutes in.
   */
  private async request<T>(path: string, params: Record<string, string>) {
    const run = async (): Promise<T> => {
      const url = new URL(path, API_BASE);
      // `raw_json=1` stops Reddit HTML-escaping &, < and > inside selftext and
      // comment bodies. Without it every URL with a query string arrives
      // containing `&amp;` and the link resolver extracts a broken URL.
      url.search = new URLSearchParams({ ...params, raw_json: "1" }).toString();

      // Retried here rather than inside rateLimitedFetch because a 401 is not a
      // throttle — it needs a new token before the retry means anything.
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const wait = this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
        if (wait > 0) await sleep(wait);

        this.lastRequestAt = Date.now();
        this.requestCount++;

        const response = await rateLimitedFetch(
          url,
          {
            headers: {
              Authorization: `Bearer ${await this.getToken()}`,
              "User-Agent": env.REDDIT_USER_AGENT,
            },
          },
          { label: `reddit ${path}` },
        );

        if (response.status === 401) {
          // Reddit occasionally invalidates a token before its stated expiry.
          this.token = null;
          await response.arrayBuffer().catch(() => undefined);
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Reddit ${response.status} for ${url.pathname}: ${await response.text()}`,
          );
        }

        // Reddit, unlike Arctic Shift, publishes how much budget is left. Slow
        // down proactively once it runs thin instead of sprinting into a 429 and
        // paying the full reset window.
        const remaining = Number(response.headers.get("x-ratelimit-remaining"));
        if (Number.isFinite(remaining) && remaining < 5) {
          const reset = Number(response.headers.get("x-ratelimit-reset"));
          if (Number.isFinite(reset) && reset > 0) {
            logger.warn(
              `reddit quota nearly spent (${remaining} left), pausing ${reset}s`,
            );
            await sleep(Math.min(reset * 1000, 300_000));
          }
        }

        return (await response.json()) as T;
      }

      throw new Error(
        `Reddit request to ${path} failed after ${MAX_ATTEMPTS} auth attempts`,
      );
    };

    // Chain onto the queue so concurrent callers still respect one shared
    // interval. The catch keeps one failure from poisoning every later link.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Hydrate up to 100 things by fullname.
   *
   * This is what makes a Reddit-primary backfill possible at all. Listing
   * endpoints stop at 1,000 items, which is less than a third of the
   * subreddit — but `/api/info` has no such ceiling, so an id list from any
   * source can be turned into live Reddit data 100 at a time.
   */
  async info(fullnames: string[]): Promise<RedditThing[]> {
    if (fullnames.length === 0) return [];
    if (fullnames.length > 100) {
      throw new Error(`/api/info accepts at most 100 ids, got ${fullnames.length}`);
    }
    const body = await this.request<Listing>("/api/info", {
      id: fullnames.join(","),
    });
    return body.data.children;
  }

  /**
   * Fetch a submission's comment tree, flattened.
   *
   * The response is a two-element array — the submission listing, then the
   * comments — and the comment listing is a *tree*: replies hang off each
   * comment's `data.replies` as another nested listing, not as siblings. Taking
   * only the top-level children would silently drop every reply, which in this
   * subreddit is where a large share of the off-site image links live.
   *
   * `more` stubs are not expanded. The busiest post in this subreddit's history
   * has 37 comments, far below the point where Reddit truncates a tree, so
   * `morechildren` handling would be dead code — the `kind === "more"` children
   * counted here are the signal if that ever stops being true.
   */
  async comments(postId: string): Promise<RedditThing[]> {
    const body = await this.request<unknown>(`/comments/${postId}`, {
      limit: "500",
      depth: "20",
      sort: "old",
    });

    if (!Array.isArray(body)) return [];
    const commentListing = body[1];
    if (!isListing(commentListing)) return [];

    const flat: RedditThing[] = [];
    let truncated = 0;

    const walk = (children: RedditThing[]) => {
      for (const child of children) {
        if (child.kind === "more") {
          truncated++;
          continue;
        }
        if (child.kind !== "t1") continue;

        flat.push(child);

        // `replies` is an empty string when a comment has none, and a full
        // Listing when it does.
        const replies = (child.data as { replies?: unknown }).replies;
        if (isListing(replies)) walk(replies.data.children);
      }
    };

    walk(commentListing.data.children);

    if (truncated > 0) {
      logger.warn(
        `post ${postId} returned ${truncated} unexpanded "more" stubs; ` +
          `comment tree is deeper than assumed and morechildren is now needed`,
      );
    }

    return flat;
  }

  /**
   * Walk a listing endpoint newest-first, stopping when `shouldStop` says so.
   *
   * Used for both `/new` and `/comments`, which is why the caller supplies the
   * stop condition rather than this returning everything.
   */
  async *listing(
    path: string,
    shouldStop: (thing: RedditThing) => boolean,
  ): AsyncGenerator<RedditThing> {
    let after: string | null = null;
    for (;;) {
      const body: Listing = await this.request<Listing>(path, {
        limit: "100",
        ...(after ? { after } : {}),
      });

      for (const child of body.data.children) {
        if (shouldStop(child)) return;
        yield child;
      }

      after = body.data.after;
      if (!after || body.data.children.length === 0) return;
    }
  }
}
