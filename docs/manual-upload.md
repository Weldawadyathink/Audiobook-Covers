# Manual upload — design

How a cover gets into the catalogue by hand, and why it goes the long way round.

**Scope.** `/admin/upload` is a front end for one Trigger.dev task,
`ingest-image`, which is the only thing in this repo that creates an `image` row.
The page stages bytes, starts a run per file, and renders what the runs publish
about themselves. It contains no ingest logic, and it is deliberately not the
only intended caller.

## Pipeline

```
browser
   │  stageUpload           server fn, multipart → R2 binding
   ▼
incoming/<32 hex>            staged bytes, public by key, short-lived
   │  startImageIngest      server fn → tasks.trigger("ingest-image")
   ▼
ingest-image                 one run per file
   ├─ hash          decodeImage → downscaleToSquare → perceptualHash
   ├─ dedupe        bit_count(phash64 # …) ≤ 4      ← may stop here for review
   ├─ row           generateImageId → INSERT ... ON CONFLICT DO NOTHING
   ├─ original      copy to original/<id>.<ext>, delete the staged object
   ├─ reddit        ensurePostStubs, so provenance resolves
   ├─ derivatives   generate-image-sizes  (9 objects, blurhash, true format)
   ├─ embedding     rebuild-embedding     (jina-clip-v2)
   ├─ classify      extract-olid          (skipped if the match was typed in)
   └─ supersede     searchable = false + superseded_by on the copies it replaces
   ▼
image                        a cover the site can display

   on a throw: bytes → failed/<id>.<ext>, live objects deleted, row purged
```

The future Reddit archiver is expected to call the same task with
`bytes: { kind: "url" }`, once per URL `extractUrls()` gives it. That is the
reason this is a task rather than a server function: the archiver does not have a
browser, and the manual pane does not have a URL worth fetching.

## Settled decisions

**One ingest path, and the manual pane is not it.** The uploader was asked for as
"the same codepath as the automated importer", which did not exist —
`docs/reddit-import.md` ends at `reddit_post`/`reddit_comment` and says the
archiver is unwritten. So the shared path was built first and the pane made its
first caller. The alternative, an upload-specific orchestration to be
consolidated later, is how two importers end up disagreeing about what a cover
row looks like.

**Bytes travel through the bucket, not through a payload.** The Worker cannot use
`src/trigger/s3.ts` (it imports `node:stream` and reads credentials from
`process.env`), and multi-megabyte base64 in a task payload runs into Trigger's
payload ceiling. So the Worker writes the file through an R2 binding — no
signing, no credentials — and the task reads it back with the S3 client it
already has. `src/image/staging.ts` is the whole contract and is dependency-free
so both runtimes can import it.

**The staged object is unguessable and short-lived, not private.** It lives in the
same bucket as the catalogue, which is served publicly at
images.audiobookcovers.com, so `incoming/<key>` is readable by anyone holding the
key. The key is 32 hex characters from the CSPRNG, the object is `no-store`, and
it is deleted the moment ingest copies it — or the moment an admin discards it.
Anything more (a second private bucket, presigned reads) buys secrecy for a book
cover that is about to be published anyway.

**Duplicates are decided before the row exists.** An `image` row is an S3 key, a
public URL and a search result all at once, so the cheapest moment to discover a
cover is already held is before any of those exist. Inserting first and
reconciling later means the site can serve two copies in the meantime.

**A failed run leaves nothing behind.** The row is claimed before the derivatives
exist — that ordering is what makes an id collision resolvable — so anything that
fails downstream would otherwise strand a row carrying a `phash64` and no
objects. That orphan is a perfect-distance, equal-resolution duplicate of exactly
the file the admin is about to upload again, so the retry would stop for a review
against the wreckage of its own last attempt, with a broken thumbnail. Instead
the run unwinds itself: bytes to `failed/`, live objects deleted, row purged.
Retries are `maxAttempts: 1` project-wide, so there is no later attempt this
pulls the ground out from under.

**A higher-resolution upload wins unattended; anything else stops and asks.**
Strictly more pixels than every match is the overwhelmingly common manual import —
somebody found the original artwork behind a Reddit-compressed repost — and it
goes through without a click, marking the copies it beats `searchable = false`.
Equal or lower resolution, a match with no recorded dimensions, and any match that
has been soft-deleted all stop the run, which returns the matches and writes
nothing. Re-uploading a cover that was deleted on purpose is the one duplicate
outcome nobody wants to happen quietly.

**Superseding hides, never deletes.** `searchable = false` keeps the old row, its
id, its URL and its object; the cover simply stops appearing in search. Nothing an
automatic decision does here is destructive, and the Searchable toggle on
`/images/<id>` puts it back.

**The hidden row records what replaced it.** `image.superseded_by` is set at the
same moment, and is the only durable trace of the decision — without it a hidden
row is indistinguishable from one an admin hid by hand, and the copy that won is
findable only in a task's run output. It sits on the loser rather than as a list
on the winner because that is the direction the question gets asked in, and
because one nullable column beats a `text[]` this repo cannot parse back cleanly.

**The hash uses `imagePixels`, not `codec`.** Both decode an image, and
`codec.decodeToRgba` is already being decoded for the derivatives — but the
existing `phash64` column was filled by `decodeImage` + `downscaleToSquare`, and a
different downscale filter moves low-frequency DCT coefficients. A hash that
drifts from the stored ones is a duplicate detector that quietly stops detecting,
so the upload pays for a second decode to stay comparable. Both modules moved from
`src/scripts/` to `src/image/` for this, since a task cannot import from a scripts
directory that exists to be run by hand.

**The classifier runs even when the upload supersedes a matched copy.** A fresh
look is the honest default: the old match may itself have been an LLM guess, and
the cover being visually identical does not make a wrong match right. What the
superseded copy's match buys is an _offer_ — the pane shows the matched work and
one click adopts it, which is a human decision and lands as `HUMAN`. A match typed
into the form before upload skips the classifier entirely, because there is nothing
to learn from paying four LLM calls to guess an answer somebody already knows.

**Metadata is shared across a submission, not per file.** A Drive folder or a
gallery post carries a dozen covers from one source. Typing the same URL twelve
times is how the fourth one ends up subtly wrong.

**Reddit ids are parsed, not typed.** `image.reddit_post_id` holds a bare base36
id, and almost nothing an admin has to hand is in that shape — a browser gives a
permalink, the API gives a `t3_` fullname, and only the database gives the bare
id. `src/reddit/ids.ts` takes any of them. The pane normalises the field on blur
so the admin can see what was understood, and the server normalises again on the
way in so a paste followed straight by the keyboard still works.

**A Reddit post id is enough provenance.** Given only a post id, `image.source`
becomes `https://reddit.com/<id>` — the legacy shape `shapeImageData` already
rewrites to a redd.it link — and `ensurePostStubs` writes a bare `reddit_post` row
so the id resolves and joins the nightly hydration queue. That helper moved into
`archive.ts` and is now shared with the comments poller, which needed exactly the
same thing for the same reason.

**Progress lives in run metadata.** The pane subscribes with
`useRealtimeRun` and a public access token scoped to the runs it started, and
renders the `steps` object the task publishes. The task is therefore the only
place that knows what its stages are — a checklist hard-coded in the page would be
a second source of truth that goes stale the first time a stage is added.

**Failure is not a step status.** A failing stage stays `running` while the run
itself goes `FAILED`, and the pane reads the run status. Recording the failure in
metadata as well would create two places that can disagree about the same fact.

## Gotchas discovered

**The R2 binding must be `remote` in local development.** Half of this handoff is a
Trigger.dev task holding real S3 credentials. A Miniflare-local bucket would take
every staged upload and put it somewhere the pipeline cannot see, so the uploader
would appear to work and every run would fail with "nothing staged at". Hence
`"remote": true` on the development binding in `wrangler.jsonc`.

**Nothing prunes `failed/`, and the cleanup is not total.** The prefix is written
by `quarantine` and read by nobody; a lifecycle rule is the right answer if it
ever adds up. The cleanup itself only runs when the task _throws_ — a run killed
without unwinding (out of memory, a `maxDuration` abort) still strands its row,
and a `generate-image-sizes` run that dies partway through its own uploads leaks
whatever objects it had already written, since only the keys it reports back are
known here.

**A staged file survives a review it is never given.** The run returns without
deleting anything, because the retry needs those bytes. Discarding deletes them and
so does a successful import, but closing the tab on an unanswered duplicate
question leaves an object in `incoming/`. There is no sweeper: the objects are
small, unreferenced and unguessable, and a lifecycle rule on the prefix is the
right fix if it ever adds up.

**The staged key is validated against a pattern, not trusted.** It arrives in a
task payload and is handed to the object store, so anything outside
`incoming/<32 hex>` would be an arbitrary read of the bucket followed by an
arbitrary delete once the copy succeeded. `isStagingKey` is that check.

**`sniffFormat` had to leave `codec.ts`.** The Worker needs it to reject a PDF
named `cover.jpg`, and `codec.ts` reaches for `node:fs` and `createRequire` to
load the WASM codecs off disk — importing it from a server function would pull all
of that into the Worker bundle for one eight-byte comparison. It now lives in
`src/image/sniff.ts`, which is plain arithmetic over a `Uint8Array`, and is
re-exported from `codec.ts` for the existing callers.

**A declared content type says nothing.** Browsers derive `File.type` from the
filename on most platforms, and this catalogue is full of WebP bytes stored under
`.jpg` because i.redd.it serves them that way. The magic bytes decide the format,
and the format decides the extension the object is stored under.

**`bit_count` results come back as strings.** It returns `bigint`, and every
connection here sets `fetch_types: false`, so postgres-js hands back the text. The
distance column is parsed with `z.coerce.number()`. The same missing type catalogue
is why the matched authors are joined with `array_to_string` in SQL rather than
returned as `text[]` — see the note on `textArray` in `src/db.ts`.

**`extract-olid` was writing to an unqualified `image`.** Both its statements said
`FROM image` / `UPDATE image` with no schema, which follows the role's
`search_path` rather than `APP_STAGE` — the exact failure mode called out in
`CLAUDE.md`. Fixed while wiring it into this pipeline, since the manual path runs
it on demand in dev.

## Environment

`TRIGGER_API_KEY` (`tr_dev_…` / `tr_prod_…`) must be available to the **Worker**,
not just to the tasks: the server function triggers the run and mints the scoped
public token the browser subscribes with. It is already in 1Password; what is new
is that it now has to be a secret on both Workers, and that `src/env.ts` knows
about it. Everything else this path needs — the S3 credentials, `JINA_API_KEY`,
`OPENROUTER_API_KEY` — is already synced to Trigger.dev by `trigger.config.ts`.

The name matters. `TRIGGER_SECRET_KEY` is what the SDK reads for its own
authentication _inside_ a run, and `syncEnvVars` pushes every variable in
`src/env.ts` to the Trigger.dev environment on deploy — so a variable by that
name would overwrite the platform's own credential with whatever stage happened
to be in the deploying machine's `.env`. `TRIGGER_API_KEY` collides with nothing.
