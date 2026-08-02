/**
 * Pulling a bare Reddit id out of whatever a human pasted.
 *
 * `image.reddit_post_id` and `image.reddit_comment_id` hold base36 ids with no
 * `t3_`/`t1_` prefix, matching `reddit_post.id` and `reddit_comment.id`. Almost
 * nothing a human has to hand is in that shape: a browser gives you a permalink,
 * the API gives you a fullname, and only the database gives you the bare id.
 * Asking the admin to do the conversion is asking them to get it wrong.
 *
 * Dependency-free so the browser, the Worker and the tasks can all import it.
 */

/** Base36, and long enough to be an id rather than a stray path segment. */
const BARE_ID = /^[0-9a-z]{4,16}$/;

/**
 * The submission id in a permalink.
 *
 * `/r/<sub>/comments/<post>/<slug>/<comment>` is the full form; the sub, the
 * slug and the comment are all optional in the wild, which is why only
 * `comments/<post>` is anchored on.
 */
const PERMALINK_POST = /\/comments\/([0-9a-z]{4,16})/i;
/** The comment id is the segment after the slug, and is the last one. */
const PERMALINK_COMMENT =
  /\/comments\/[0-9a-z]{4,16}\/[^/]*\/([0-9a-z]{4,16})/i;
/** `https://redd.it/<post>`, the share-sheet form. */
const SHORTLINK = /^https?:\/\/(?:www\.)?redd\.it\/([0-9a-z]{4,16})/i;
/** `?context=3`-style deep links to a comment. */
const COMMENT_QUERY = /[?&]comment=(?:t1_)?([0-9a-z]{4,16})/i;

function strip(value: string, prefix: string) {
  return value.toLowerCase().startsWith(prefix)
    ? value.slice(prefix.length)
    : value;
}

/**
 * A Reddit post id, from an id, a fullname, a permalink or a short link.
 *
 * Null when there is nothing id-shaped in there, which the caller reports rather
 * than guessing at.
 */
export function parseRedditPostId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const short = SHORTLINK.exec(value);
  if (short) return short[1]!.toLowerCase();

  if (value.includes("/comments/")) {
    const match = PERMALINK_POST.exec(value);
    return match ? match[1]!.toLowerCase() : null;
  }

  // A bare id or a fullname. Anything else with a slash or a scheme in it is a
  // URL this does not recognise, and guessing at its last path segment would
  // turn a wrong paste into a wrong provenance record.
  if (value.includes("/") || value.includes(":")) return null;

  const bare = strip(value, "t3_").toLowerCase();
  return BARE_ID.test(bare) ? bare : null;
}

/**
 * A Reddit comment id, from an id, a fullname or a permalink to the comment.
 *
 * A permalink to the *post* has no comment in it and returns null — a comment
 * link is one segment longer.
 */
export function parseRedditCommentId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const query = COMMENT_QUERY.exec(value);
  if (query) return query[1]!.toLowerCase();

  if (value.includes("/comments/")) {
    const match = PERMALINK_COMMENT.exec(value);
    return match ? match[1]!.toLowerCase() : null;
  }

  if (value.includes("/") || value.includes(":")) return null;

  const bare = strip(value, "t1_").toLowerCase();
  return BARE_ID.test(bare) ? bare : null;
}
