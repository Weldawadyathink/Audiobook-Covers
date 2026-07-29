# Reddit import — design

How posts, comments and candidate image URLs get from /r/audiobookcovers into
Postgres, and why the pieces are shaped this way.

**Scope.** This pipeline ends at a list of URLs. It does not download images.
The downloader's input is one query:

```sql
SELECT url, kind, ordinal FROM image_candidate WHERE status = 'PENDING';
```

## Pipeline

```
Arctic Shift  /api/posts/search        ← ids only, ~35 requests
   │  reddit-enumerate-post-ids
   ▼
reddit_post   (bare id stubs, hydrated_at IS NULL)
   │  reddit-hydrate-posts    /api/info, 100 ids per request   ~35 requests
   │  reddit-fetch-comments   /comments/<id>, one per post   ~1,704 requests
   ▼
reddit_raw    (append-only, every Thing Reddit ever returned)
   │  projectPosts / projectComments        ← no network
   ▼
reddit_post + reddit_comment
   │  reddit-resolve-links                  ← no network, pure function
   ▼
image_candidate   status = PENDING | UNSUPPORTED | IGNORED
```

Incremental sync runs `reddit-poll-new-posts` and `reddit-poll-new-comments`
daily, feeding the same archive and the same projections.

## Settled decisions

**Reddit is the source of content; Arctic Shift only supplies ids.** Reddit
cannot enumerate its own history — every listing endpoint stops at 1,000 items
and the subreddit has ~3,500 posts, so `/new` and `/top` together cannot reach
the first three years. `/api/info` has no such ceiling. That splits the problem
cleanly: get an id list from anywhere, then hydrate it from Reddit 100 at a time.

**The archive is the source of truth, not the typed tables.** `reddit_raw` is
append-only and holds every payload verbatim. `reddit_post`, `reddit_comment`
and `image_candidate` are projections that can be dropped and rebuilt from it
with no network access. This is what makes "teach the resolver a new host" a
seconds-long local operation instead of a re-crawl.

**The payload hash excludes volatile fields.** Score and comment count change on
almost every post between any two polls. Hashing them would archive 3,494 new
rows every single day, none of which record a change worth keeping. Volatile
values still reach `reddit_post` through the projection — they just don't
constitute a new version of the thing. See `VOLATILE_KEYS` in `archive.ts`.

**Two poll streams, not one.** `/new` catches submissions; `/r/<sub>/comments`
catches replies to posts of any age. Comments are where the off-site image links
live (498 posts carry image-bearing replies), and a reply can land on a two-year
-old post long after it leaves every listing. Polling submissions alone is how a
catalogue silently drifts while appearing to work — the previous BDFR-based
import had this shape.

**`resolver_version`, not a status column.** A post is due for re-resolution when
its `resolver_version` is below `RESOLVER_VERSION` in `resolve.ts`. Bumping that
constant re-queues the entire subreddit — no migration, no backfill script, no
Reddit traffic. The projection also nulls it whenever a post's content changes,
so edits re-resolve automatically.

**Unsupported hosts are recorded, not dropped.** Everything the resolver finds
gets a row. Hosts with no fetcher are stored `UNSUPPORTED` rather than discarded,
so the backlog stays queryable in SQL and enabling one later is an `UPDATE`
instead of a re-crawl. mediafire and mega (~230 links, mostly multi-cover
archives needing an unpack step) are parked exactly this way.

**App-only OAuth.** `grant_type=client_credentials`. Everything read is public,
so there is no reason to hold a Reddit password — and the token cannot vote, post
or moderate if it leaks.

## Gotchas discovered

**`preview.redd.it` URLs expire.** They carry an `s=` signature with a lifetime.
Storing one produces a table of links that rot silently between resolve and
download. The resolver rewrites them to `https://i.redd.it/<media id>.<ext>`,
which is permanent — and verified to return the full-resolution original, not the
downscaled preview. 187 of the 192 preview links in history are bare media ids;
the remaining five are slugged (`title-v0-<id>.jpg`) and handled by a second
pattern.

**Gallery images must come from `media_metadata`, not `s.u`.** Each gallery entry
ships a preview URL that expires. The media id plus the declared mime type
reconstructs the permanent original directly.

**`raw_json=1` is mandatory.** Without it Reddit HTML-escapes `&`, `<` and `>`
inside selftext and comment bodies, so every URL with a query string arrives
containing `&amp;` and the resolver extracts a broken link.

**Deleted posts vanish from `/api/info` rather than erroring.** The response is
simply shorter than the request. Unhandled, those ids keep `hydrated_at IS NULL`
and get retried forever; hydration diffs the response against the batch and marks
the missing ones `removed`.

**Reddit's live API returns fewer comments than ever existed.** Arctic Shift has
comments on 1,928 posts; only 1,704 posts currently report `num_comments > 0`.
The gap is removed and deleted comments Reddit will not serve again. This is the
one place the Reddit-primary decision costs data. `reddit_raw.source` is tagged
per row so an Arctic Shift top-up can be layered in later without reshaping
anything.

**`reddit_comment.id` was typed `uuid`.** No Reddit id can satisfy that, so the
column could never have held real data — it is `text` now, as is
`image.reddit_comment_id`.

## Measured cost of a full import

| Stage                       | Requests                                |
| --------------------------- | --------------------------------------- |
| Arctic Shift id enumeration | ~35                                     |
| `/api/info` hydration       | ~35                                     |
| `/comments/<id>`            | ~1,704                                  |
| Link resolution             | 0                                       |
| **Total**                   | **~1,774, about 18 minutes at 100 QPM** |

Corpus as of 2026-07: 3,494 posts, 7,204 comments, 2020-09-26 onward.

## Environment

`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` from a **script**-type app at
<https://www.reddit.com/prefs/apps>. `REDDIT_USER_AGENT` must be descriptive and
unique — Reddit throttles default library agents hard. Format:

```
node:audiobookcovers-import:1.0 (by /u/<your username>)
```
