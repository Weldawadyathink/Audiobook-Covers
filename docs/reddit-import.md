# Reddit import — design

How posts and comments get from /r/audiobookcovers into Postgres, and why the
pieces are shaped this way.

**Scope.** This pipeline ends with a complete, queryable copy of the subreddit.
It does not extract URLs into a table and it does not download images — the
archiver does both, in one pass, and its work queue is one query:

```sql
SELECT id FROM reddit_post   WHERE archived_at IS NULL;
SELECT id FROM reddit_comment WHERE archived_at IS NULL;
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
reddit_raw    (latest payload per Thing — the only table the network writes)
   │  projectPosts / projectComments        ← no network
   ▼
reddit_post + reddit_comment             archived_at IS NULL = the work queue
   ╎
   ╎  archiver (not yet written): extractUrls() → download → image rows
   ▼
image         upstream_url, reddit_post_id, reddit_comment_id
```

Incremental sync runs `reddit-poll-new-posts` (06:00) and
`reddit-poll-new-comments` (06:20). Everything else —
`reddit-hydrate-posts --includeRefresh`, `reddit-fetch-comments --includeRefresh`
— is run by hand. That is the one gap in the steady state: `/new` only returns
recent submissions, so an edit to a two-year-old post is not noticed until
somebody runs the refresh sweep.

**The archiver has no schedule because it does not exist yet.** When it lands it
needs a cron after the two pollers, or new posts will be ingested nightly and
never turned into images.

## Settled decisions

**Ingest and library are separate, with no foreign keys between them.**
`image.reddit_post_id` and `image.reddit_comment_id` join to the ingest tables by
convention only. `reddit_post` and `reddit_comment` are projections meant to be
truncated and rebuilt at will, and an enforced reference would make every rebuild
a choice between cascading into the catalogue or nulling out provenance the
library still wants. Ingest state must never be able to reach into a table of
downloaded images. Foreign keys _within_ ingest are fine and still present —
`reddit_comment.post_id` is one.

**Reddit is the source of content; Arctic Shift only supplies ids.** Reddit
cannot enumerate its own history — every listing endpoint stops at 1,000 items
and the subreddit has ~3,500 posts, so `/new` and `/top` together cannot reach
the first three years. `/api/info` has no such ceiling. That splits the problem
cleanly: get an id list from anywhere, then hydrate it from Reddit 100 at a time.

**The archive is the source of truth, not the typed tables.** `reddit_raw` holds
every payload verbatim, keyed by `(reddit_id, kind)`. `reddit_post` and
`reddit_comment` are projections that can be dropped and rebuilt from it with no
network access.

**One row per Thing, not one row per version.** `reddit_raw` is current state,
not history. An earlier design appended every version, deduplicated on a hash of
the payload with volatile fields (`score`, `num_comments`, …) stripped, so the
table doubled as an edit log. That is a completeness feature, and completeness is
not the goal here: the cost was a hash function that had to stay in sync with
which Reddit fields happen to be volatile, and it bought a history nothing read.

**Extraction is a function, not a table.** `extractUrls()` in `extract-urls.ts`
is pure — same post in, same URL list out — so the archiver recomputes it rather
than reading it back. The previous design persisted the output as an
`image_candidate` table, which had to be bulk-deleted and rebuilt on every rule
change, and which accumulated download state (`DOWNLOADED`, `FAILED`, `image_id`)
that then could not survive the rebuild. Re-resolve kept resetting finished rows
to `PENDING` and re-downloading bytes already held. The list is cheap to
recompute and was actively harmful to store.

**`archived_at`, not `is_archived`.** A null timestamp is the work queue, which
is how every other stage in this schema is spelled (`hydrated_at`,
`comments_fetched_at`, `image.derivatives_generated_at`). A boolean alongside a
date is two columns that can disagree about one fact.

**`archived_at` is set whether or not anything was downloaded.** That is the
point: a post with no links, or only links to hosts the archiver cannot fetch, is
_not actionable_ and needs a way to say so. Keying "done" off the existence of
images would leave every such post in the queue forever — precisely the set that
would then be retried most often.

**`archiver_version` is the re-run mechanism.** Bump `ARCHIVER_VERSION` in
`extract-urls.ts` and the whole subreddit falls behind at once, with no migration
and no Reddit traffic. Re-running is not re-downloading: anything that already
has an `image` row is skipped.

**Two poll streams, not one.** `/new` catches submissions; `/r/<sub>/comments`
catches replies to posts of any age. Comments are where the off-site image links
live (498 posts carry image-bearing replies), and a reply can land on a two-year
-old post long after it leaves every listing. Polling submissions alone is how a
catalogue silently drifts while appearing to work — the previous BDFR-based
import had this shape.

**Unfetchable hosts are classified, not dropped.** `extractUrls` returns
everything it finds with `fetchable: false` on hosts that have no fetcher, so the
distribution stays countable and enabling one later is a code change plus a
version bump. mediafire and mega (~240 links, mostly multi-cover archives needing
an unpack step) are parked this way.

**App-only OAuth.** `grant_type=client_credentials`. Everything read is public,
so there is no reason to hold a Reddit password — and the token cannot vote, post
or moderate if it leaks.

**A projection step must project its whole batch, never a subset.** A row can be
missing from `reddit_post`/`reddit_comment` while its payload is perfectly
current — after a truncate-and-rebuild, or when it was skipped the first time.
Scoping a projection to "what looks new" means those rows are never projected at
all, and refetching does not help. `archiveThings` returns every fullname it
wrote, and that is the work list.

## Gotchas discovered

**`reddit_raw` is keyed on `(reddit_id, kind)`, not on the id alone.** Posts and
comments share the table and their base36 id spaces are independent, so `abc123`
can name both — on `reddit_id` alone one would silently overwrite the other.
Storing the prefixed fullname (`t3_abc123`) would disambiguate too, but then
`kind` is a derived duplicate of the prefix, nothing stops the contradictory row
`('t3_abc123', 'comment')`, and every projection and every join to the typed
tables has to go through a `substring`. Bare ids keep `reddit_raw` in the same
id-space as `reddit_post`, `reddit_comment` and `image`.

**`preview.redd.it` URLs expire.** They carry an `s=` signature with a lifetime,
so a stored one rots between extraction and download. `extractUrls` rewrites them
to `https://i.redd.it/<media id>.<ext>`, which is permanent — and verified to
return the full-resolution original, not the downscaled preview. 187 of the 192
preview links in history are bare media ids; the remaining five are slugged
(`title-v0-<id>.jpg`) and handled by a second pattern.

**Gallery images must come from `media_metadata`, not `s.u`.** Each gallery entry
ships a preview URL that expires. The media id plus the declared mime type
reconstructs the permanent original directly.

**`raw_json=1` is mandatory.** Without it Reddit HTML-escapes `&`, `<` and `>`
inside selftext and comment bodies, so every URL with a query string arrives
containing `&amp;` and the parser extracts a broken link.

**Deleted posts vanish from `/api/info` rather than erroring.** The response is
simply shorter than the request. Unhandled, those ids keep `hydrated_at IS NULL`
and get retried forever; hydration diffs the response against the batch and marks
the missing ones `removed`.

**The poller's overshoot has to keep what it walks past, not just count it.**
Listings are not append-only — an approved or crossposted item appears _below_
fullnames the previous run already recorded — so the hundred items past the
cursor are exactly where the missed ones are. The first version of `collectNew`
scanned that window and collected nothing from it, discarding the only case
overshooting exists to catch. Re-collecting things already held is free: the
archive upsert makes it a no-op.

**A firehose comment can name a post nothing has enumerated.** `projectComments`
skips comments whose post is missing to keep the foreign key satisfiable, and
that skip is permanent — nothing goes back for it. The comments poller writes a
bare `reddit_post` stub for any unknown `link_id` first, which is what the id
enumeration does anyway; the comment projects immediately and the post joins the
hydration queue.

**Reddit's live API returns fewer comments than ever existed.** Arctic Shift has
comments on 1,928 posts; only 1,704 posts currently report `num_comments > 0`.
The gap is removed and deleted comments Reddit will not serve again. This is the
one place the Reddit-primary decision costs data, and it is an accepted cost —
the goal is not a complete archive against post authors' wishes.
`reddit_raw.source` is tagged per row so an Arctic Shift top-up could be layered
in later without reshaping anything.

## Measured cost of a full import

| Stage                       | Requests                                |
| --------------------------- | --------------------------------------- |
| Arctic Shift id enumeration | ~35                                     |
| `/api/info` hydration       | ~35                                     |
| `/comments/<id>`            | ~1,704                                  |
| **Total**                   | **~1,774, about 18 minutes at 100 QPM** |

Corpus as of 2026-07: 3,494 posts, 7,204 comments, 2020-09-26 onward.

## Environment

`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` from a **script**-type app at
<https://www.reddit.com/prefs/apps>. `REDDIT_USER_AGENT` must be descriptive and
unique — Reddit throttles default library agents hard. Format:

```
node:audiobookcovers-import:1.0 (by /u/<your username>)
```
