/**
 * Retry and rate-limit handling shared by both upstreams.
 *
 * Reddit and Arctic Shift throttle differently — Reddit publishes a fixed
 * budget it decrements, Arctic Shift computes limits dynamically from server
 * load and only tells you when the window resets — but both answer the same
 * question in the same headers, so one helper serves both. Neither is a service
 * we control, and Arctic Shift is a free volunteer-run archive, so the default
 * posture is to believe whatever it says about when to come back.
 */
import { logger } from "@trigger.dev/sdk/v3";

/** Never sleep longer than this in one go, whatever a header claims. */
const MAX_BACKOFF_MS = 300_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function headerNumber(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * How long to wait before retrying, in milliseconds.
 *
 * Ordered by how specific the signal is. `retry-after` is the HTTP standard and
 * wins when present; both upstreams otherwise use the `x-ratelimit-*` family.
 * Arctic Shift documents `X-RateLimit-Reset` (seconds) and `X-RateLimit-Reset-At`
 * (absolute timestamp) as the two ways to learn when a 429 clears; Reddit sends
 * `x-ratelimit-reset` in seconds.
 */
export function retryDelayMs(response: Response, attempt: number): number {
  // `retry-after` is either delta-seconds or an HTTP date.
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(date - Date.now(), 0), MAX_BACKOFF_MS);
    }
  }

  // Absolute reset timestamp. Arctic Shift sends this in epoch milliseconds;
  // accept seconds too rather than trusting a magnitude convention to hold.
  const resetAt = headerNumber(response, "x-ratelimit-reset-at");
  if (resetAt !== null && resetAt > 0) {
    const epochMs = resetAt > 1e11 ? resetAt : resetAt * 1000;
    const delta = epochMs - Date.now();
    if (delta > 0) return Math.min(delta, MAX_BACKOFF_MS);
    // Already in the past: the window has rolled over, so retry immediately
    // rather than falling through to a backoff that would be pure dead time.
    return 0;
  }

  // Relative reset, in seconds. Both upstreams use this spelling.
  const reset = headerNumber(response, "x-ratelimit-reset");
  if (reset !== null && reset >= 0) {
    return Math.min(reset * 1000, MAX_BACKOFF_MS);
  }

  return Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
}

export interface RateLimitedFetchOptions {
  /** Names the upstream in log lines and error messages. */
  label: string;
  maxAttempts?: number;
  /**
   * Called before each retry that was caused by a response (not a network
   * error), so callers can surface throttling without parsing headers again.
   */
  onThrottle?: (delayMs: number, response: Response) => void;
}

/**
 * Fetch with retries on 429, 5xx and transport errors.
 *
 * Returns the first response that is neither throttled nor a server error.
 * Non-retryable failures (404, 400) come back as-is for the caller to interpret
 * — a missing post is not a transport problem.
 */
export async function rateLimitedFetch(
  url: URL | string,
  init: RequestInit,
  { label, maxAttempts = 5, onThrottle }: RateLimitedFetchOptions,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // Transport failure carries no headers to learn from, so back off blind.
      lastError = error;
      const delay = Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
      logger.warn(`${label}: network error, retrying in ${delay}ms`, {
        error: String(error),
      });
      await sleep(delay);
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      const delay = retryDelayMs(response, attempt);
      onThrottle?.(delay, response);
      lastError = new Error(`${label}: HTTP ${response.status}`);
      logger.warn(
        `${label}: HTTP ${response.status}, waiting ${delay}ms before retry ${attempt + 1}/${maxAttempts}`,
      );
      // Drain the body so the connection can be reused for the retry.
      await response.arrayBuffer().catch(() => undefined);
      await sleep(delay);
      continue;
    }

    return response;
  }

  throw new Error(
    `${label}: gave up after ${maxAttempts} attempts: ${String(lastError)}`,
  );
}
