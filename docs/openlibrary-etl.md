# OpenLibrary ETL — design and implementation plan

How the monthly OpenLibrary dump gets from openlibrary.org into Postgres, why the
pieces are shaped the way they are, and what is left to build.

## Pipeline

```
openlibrary.org  ol_dump_latest.txt.gz  (~12GB compressed)
   │  trigger.dev: openlibrary-download-to-s3 (ranged download, gunzip, multipart upload)
   ▼
GCS  gs://<ETL_S3_BUCKET>/openlibrary/<dumpDate>/all.csv     (~100GB+, 1-day lifecycle)
   │  BigQuery: LOAD DATA OVERWRITE → 9-table transform DAG
   ▼
BigQuery  works_for_postgres  (~30M rows)   +   works_for_postgres_synced_hashes (olid, row_hash)
   │  EXPORT DATA … FORMAT PARQUET  → many small files
   │  delta export (default) or full export (explicit fullRebuild) — decided BEFORE this step
   ▼
GCS  .../exports/works-for-postgres/<dumpDate>/<exportId>/part-*.parquet   (1-day lifecycle)
   │  trigger.dev workers: DuckDB ATTACH postgres → bulk INSERT
   ▼
Postgres (PlanetScale, AWS us-east-1)  openlibrary_work
```

trigger.dev orchestrates end to end and owns the run lease. BigQuery does all
joins and aggregation. Postgres only receives a narrow, denormalized result.

## Settled decisions

**The dump is mandatory.** OpenLibrary's API cannot be used for the agentic OLID
workflow (usage guidelines plus an explicit request from OpenLibrary). Every
design has to work from the monthly dump.

**Postgres is the search backend, not R2 + DuckDB.** `extract-olid` fans out to
one trigger.dev run _per image_, and phase 2 is another run again. There is no
long-lived process to amortise loading a multi-GB index against, so a shared
always-on index is the right shape. Revisit only if extraction is ever
restructured into a long-lived batch worker.

**Push, not pull.** `pg_duckdb` is available on PlanetScale, but testing
confirmed it cannot write into Postgres heap tables — its write path is
`COPY (SELECT …) TO 's3://…'`, i.e. files out. So the loader runs outside the
database and pushes.

**DuckDB manages its own Postgres connection.** DuckDB's `postgres` extension
attaches with `ATTACH 'dbname=… host=…' AS pg (TYPE postgres)` and writes via
binary COPY internally. This replaces the hand-rolled
JSON → CSV → jsonb-staging → unpack pipeline entirely, and maps `text[]`
natively.

> DuckDB is used **only as bulk transport** into a staging or new table with a
> plain `INSERT`. The merge/upsert runs as ordinary SQL over a normal Postgres
> connection. `ON CONFLICT` semantics through the attach layer are not something
> to discover at 30M rows.

**trigger.dev, not Cloud Run.** Ephemeral disk was the entire justification for
Cloud Run. BigQuery emits many small Parquet files, so the export never has to be
materialised at once — each file is a bounded unit of work with no long-lived
stream and no multi-GB staging. Cloud Run adds a second deploy target for no
remaining benefit.

**Parquet, not gzipped JSON.** Typed, columnar, compressed. Arrays survive as
arrays. Removes three parses per row.

## Gotchas discovered (each of these has bitten or would have)

**Disconnecting during `CREATE INDEX` rolls the build back.** The build runs in a
backend owned by the client connection. On disconnect the transaction aborts.
Worse, `client_connection_check_interval` defaults to `0`, so the backend often
runs the _entire_ build, tries to write the result, finds a dead socket, and only
then aborts — full cost, no index. Long DDL must be detached via `pg_cron`.

**`DELETE` does not reclaim storage.** Dead tuples sit in the heap until vacuum;
plain `VACUUM` only makes space reusable, it does not return it to the
filesystem. `VACUUM FULL` does, by rewriting the table — needing the 2x headroom
we are trying to avoid. Shrinking a table at peak requires `DROP`/`TRUNCATE`,
which unlink files immediately.

**Unlogged tables are not replicated to standbys.** PlanetScale permits
`UNLOGGED`, but a table swapped into production must be `LOGGED` or it is lost on
failover. Use `UNLOGGED` only for genuinely transient staging.

**JS template literals silently eat regex escapes.** `` `r'(\d{4})'` `` becomes
`r'(d{4})'` — matching the literal string `dddd`. This made
`editions_normalized.publish_year` always NULL, which propagated to
`first_publish_year` for most works. `String.raw` is not a fix: it preserves the
backslash before every escaped backtick, and BigQuery table refs are full of
them. **All BigQuery SQL lives in `src/trigger/openlibrary/sql/*.sql`.**

**A table swap is safe here** because `image.openlibrary_work_id` has no foreign
key to `openlibrary_work`. Verify this still holds before relying on it.

**`CREATE TABLE … AS SELECT` silently drops everything but column types.** No
`NOT NULL`, no defaults, no primary key, no indexes, no check constraints. Use
`CREATE TABLE … (LIKE source INCLUDING …)` followed by `INSERT INTO … SELECT`.
Re-declaring the schema by hand in the loader is the alternative and it will
drift from `db/schema.ts` the first time a column is added.

**`UNLOGGED` → `LOGGED` rewrites the whole table.** Which needs the 2x headroom
the storage strategy exists to avoid, so it cancels the benefit. Any table
destined to be swapped into production is built `LOGGED` from the start.
`UNLOGGED` is only for staging that is never swapped in.

**Checkpointed waits stop timers.** `wait.for` suspends and serialises the run,
so a `setInterval` heartbeat does not fire while the run is asleep. Any lease
must be renewed explicitly on resume, not on a timer — see Phase 4.

**DuckDB's attached connection cannot see another connection's `TEMP` tables.**
DuckDB `ATTACH` opens its own libpq session, so a `TEMP` table created by the
node-postgres connection is invisible to it and vice versa. Staging tables in the
DuckDB path must be permanent (and may be `UNLOGGED`).

**pg_cron does not guarantee non-overlapping runs.** A recurring schedule whose
job outlives its interval can fire again while the previous run is still going.
Never give long DDL a short recurring schedule — see Phase 4 for the shape that
sidesteps this entirely.

## Already implemented

- Elasticsearch removed; `searchOpenLibraryWorks()` is Postgres FTS over the two
  GIN expression indexes (`src/trigger/openlibrary/work-search.ts`). The
  `to_tsvector` expressions must match the index definitions in `db/schema.ts`
  **verbatim** or the query silently degrades to a seq scan over 30M rows.
- `subjects` + `description` added to `openlibrary_work` and `works_for_postgres`.
- BigQuery SQL extracted to `.sql` files, loaded via `?raw` (Vite native; esbuild
  taught the same by `sqlRawPlugin` in `trigger.config.ts`). `renderSql()`
  substitutes `${project}` / `${dataset}` / `${bucket}` / `${csvKey}` and throws
  on unknown placeholders.
- `openlibrary_etl_state`: single-row lease + progress table. Atomic claim via a
  conditional `INSERT … ON CONFLICT DO UPDATE … WHERE`, expired-lease takeover,
  run-scoped mutations. Verified against a real Postgres with 33 assertions
  including a 12-way parallel claim storm.
  **Needs rework for the new design:** the `setInterval` heartbeat at
  `etl.ts:106-120` assumes a continuously running process. Once the orchestrator
  sleeps with `wait.for`, the timer stops firing and the 5-minute lease lapses
  mid-run, letting another run take over. Replace the timer with explicit
  renewal (Phase 4).
- Checkpoint reduced to `(olid, row_hash)` — the delta query never read anything
  else from the synced side.
- BigQuery processing tables dropped after a successful run; the drop list is
  derived from the query DAG via `getProcessingTableNames()`.
- GCS retention via bucket lifecycle rule (`infra/gcs-lifecycle.json`), not inline
  deletes, so a failed run can retry without re-downloading ~12GB.
- Dead code removed: `backfill-canonical-score`, `redirects_normalized`,
  `lib/openlibrarySearch.ts`, the DuckDB helpers in `openlibrary/utils.ts`, and
  the `@duckdb/node-api` / `node-addon-api` / `node-gyp` dependencies.

## To build

### Phase 1 — export format, export mode, and safety

1. Switch `EXPORT DATA` from gzipped JSON to `FORMAT PARQUET`.

2. **Write to a unique immutable prefix per export:**

   ```
   exports/works-for-postgres/<dumpDate>/<exportId>/part-*.parquet
   ```

   A retry can never collide with a previous run's shards, and the loader's file
   list is unambiguous. This removes the need for the pre-run `clearDirectory`
   that currently guards against reading stale shards — delete it once the prefix
   is unique. The lifecycle rule still sweeps the whole tree by age.

3. **Export mode is decided before BigQuery runs, not after.** The delta export
   joins against the checkpoint and emits `change_type`; a full export just dumps
   `works_for_postgres`. They are different queries producing different columns,
   so this cannot be chosen after the fact.

   Default to **delta**. A full export happens only when the run is explicitly
   asked for one.

   This needs a payload, and `schedules.task` has a fixed payload shape — so
   split it: `openLibraryEtlTask` becomes a `schemaTask` taking
   `{ fullRebuild?: boolean }`, with a thin `schedules.task` wrapper that
   triggers it with defaults. That also makes manual/parameterised runs possible,
   which the current shape does not allow.

4. **Measure the delta ratio before exporting, and refuse to guess.** One cheap
   `COUNT` against the checkpoint join (both sides are two columns now) gives the
   ratio. If it exceeds the threshold, **abort with a message** rather than
   proceeding.

   This is deliberately the same guard as the delete blast-radius check, because
   the two situations are indistinguishable from inside the pipeline:
   - a truncated OpenLibrary dump (mostly deletes) — must not be applied
   - a legitimate schema change (mostly upserts) — needs `fullRebuild: true`

   Only a human can tell these apart, so the pipeline stops and says which
   numbers it saw. Nothing currently stops a partial dump from emptying the
   table, and nothing stops a schema change from grinding through 30M individual
   upserts.

Items 1, 2 and 4 are independent of the loader rewrite and useful immediately.

### Phase 2 — DuckDB loader on trigger.dev

Restore `@duckdb/node-api` plus the `external` entry in `trigger.config.ts`
(removed when the old DuckDB helpers were deleted).

Orchestrator lists the export objects and fans out N loaders via the existing
`batchTriggerAndWait`. Each loader gets a **list** of files and reads them as one
glob — DuckDB parallelises the reads internally, which matters because BigQuery
emits many small files and per-file HTTP overhead otherwise dominates.

```sql
ATTACH 'dbname=… host=… user=… password=…' AS pg (TYPE postgres);
INSERT INTO pg.<target> SELECT * FROM read_parquet(['gs://…/part-000.parquet', …]);
```

`<target>` must be a **permanent** table, not `TEMP`. DuckDB's `ATTACH` opens its
own libpq session and cannot see a `TEMP` table created by the node-postgres
connection that runs the merge. Path A therefore needs a real
`openlibrary_work_stage` table — `UNLOGGED` is right here, since it is purely
transient and never swapped into production. Path B has DuckDB write straight
into `openlibrary_work_new`.

Then the merge runs over a normal connection, in chunks, committing per chunk.
Never one long transaction: a multi-hour transaction pins the xmin horizon and
blocks autovacuum across the entire database, not just this table.

Verify on a single small file before anything else: `text[]` round-trip for
`author_names`, `author_aliases`, `title_aliases`, `subjects`.

### Phase 3 — two load paths

**Path A — delta under ~10% (the normal month).** Load into a typed staging
table, then chunked `INSERT … ON CONFLICT` + delete, ~25–50k rows per commit,
sorted by `olid` so btree writes stay near-sequential.

**Path B — delta over ~10%, or a forced refresh.** Build and swap. The cost of a
large upsert is GIN index maintenance — two expression indexes, random I/O per
row. COPY into an unindexed table is near-linear and the indexes get built once,
sequentially.

Storage stays at 1x by swapping the _small_ table in first:

```sql
-- 1. tiny table of what the website actually needs.
--    LIKE … INCLUDING ALL, never CREATE TABLE AS SELECT: CTAS keeps only column
--    types and would silently drop NOT NULL, defaults, the PK and the indexes.
CREATE TABLE openlibrary_work_keep (LIKE openlibrary_work INCLUDING ALL);
INSERT INTO openlibrary_work_keep
SELECT * FROM openlibrary_work
WHERE olid IN (SELECT DISTINCT openlibrary_work_id FROM image
               WHERE openlibrary_work_id IS NOT NULL);
-- INCLUDING ALL brings the indexes with it, which is fine at this size.

-- 2. swap it in, then DROP the big one — reclaims immediately
BEGIN;
  SET LOCAL lock_timeout = '10s';
  ALTER TABLE openlibrary_work      RENAME TO openlibrary_work_old;
  ALTER TABLE openlibrary_work_keep RENAME TO openlibrary_work;
COMMIT;
DROP TABLE openlibrary_work_old;

-- 3. build the full table at 1x. LOGGED (the default) — building it UNLOGGED
--    and flipping it later rewrites the whole table, which needs exactly the
--    headroom this sequence exists to avoid.
--    Everything EXCEPT indexes, so the bulk load stays near-linear.
CREATE TABLE openlibrary_work_new (
  LIKE openlibrary_work
  INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED INCLUDING COMMENTS
);
-- … DuckDB loads every Parquet part into openlibrary_work_new …
ALTER TABLE openlibrary_work_new ADD PRIMARY KEY (olid);
CREATE INDEX … ON openlibrary_work_new USING gin (…);   -- both, via pg_cron
ANALYZE openlibrary_work_new;

-- 4. swap in, drop the keep table
```

Note the asymmetry in the two `LIKE` clauses: the keep table takes
`INCLUDING ALL` because it is small and wants its indexes immediately, while the
full table deliberately omits `INCLUDING INDEXES` so 30M rows land in a heap with
no index maintenance. `PRIMARY KEY` arrives via `INCLUDING INDEXES` in Postgres,
so the full table has to add it explicitly after loading — which is what you want
anyway, since building the PK in bulk beats maintaining it per row.

`lock_timeout` so the `ACCESS EXCLUSIVE` grab fails fast instead of queueing
behind a long reader and blocking every query on the table. `ANALYZE` before the
swap — after replacing 30M rows the planner is working from stale statistics,
which is an easy way to make the app feel broken after a "successful" load.

### Phase 4 — pg_cron for long DDL, and cost

`pg_cron` is supported on PlanetScale (1.6.7 on PG 18.4, 1.6.5 on 17.10).

The point is billing: trigger.dev's `wait.for` / `wait.until` checkpoints the run
so the sleep is not billed. Previously a worker was kept alive holding a Postgres
connection, which burned compute for hours. Instead:

```
renew lease  →  schedule the DDL via pg_cron  →  close the connection
loop:
  wait.for({ minutes: 5 })          ← not billed
  reconnect → renew lease → poll → disconnect
    cron.job_run_details            → succeeded / failed
    pg_stat_progress_create_index   → live % while running
unschedule, verify the index exists, continue
```

Polling `pg_stat_progress_create_index` makes each wake-up informative rather
than blind, which matters for a step that may run an hour.

#### Scheduling shape — avoiding overlapping fires

pg_cron does not reliably suppress a scheduled fire while a previous run of the
same job is still going, so a long `CREATE INDEX` on a short recurring schedule
risks stacking concurrent index builds.

**Self-unscheduling does not fix this.** If the command is
`CREATE INDEX …; SELECT cron.unschedule(…);` the unschedule only runs after the
hour-long build finishes — every intervening fire has already happened. Putting
the unschedule _first_ would avoid the stacking but leaves no record and no
retry, and it still hits the cross-database problem below.

**Pin the schedule so it fires once and does not naturally recur for a year.**
Compute a concrete minute one or two minutes out and encode the day and month:

```
now = 2026-07-28 03:14  →  schedule '20 3 28 7 *'  →  fires 03:20 today,
                                                      next natural fire: 2027-07-28
```

One fire, a year of margin, and correctness no longer depends on pg_cron's
overlap semantics. The orchestrator unschedules once it sees the job start; the
year-out pin means a missed unschedule is harmless rather than catastrophic.
Cost is up to ~1 minute of start latency, which is nothing against an hour-long
build.

#### Lease renewal

The `setInterval` heartbeat in `etl.ts:106-120` must go. `wait.for` suspends the
run, so the timer never fires while asleep and the lease silently lapses. Replace
with:

- Explicit `renewEtlLease()` calls at natural checkpoints: after each BigQuery
  query batch, after each loader batch, and immediately on every wake-up.
- Lease TTL raised well above the poll interval — roughly 4x, so ~20-30 minutes
  against a 5-minute poll. A single missed wake-up must not drop the lease.
- The timer is also `unref()`'d today, which makes its firing unreliable
  regardless. Deleting it removes both problems.

#### Connections and permissions

pg_cron is installed in a single database (`postgres`); the application runs
against `audiobookcovers`. Consequences:

- Schedule with **`cron.schedule_in_database(job_name, schedule, command,
'audiobookcovers', …)`** so the DDL executes against the right database.
  Plain `cron.schedule()` would run it in `postgres`.
- The orchestrator needs a second connection to the `postgres` database to
  schedule, poll, and unschedule. Derive it from `DATABASE_WRITE_URL` by swapping
  the dbname rather than adding another secret.
- Grant the `audiobookcovers` role access: `GRANT USAGE ON SCHEMA cron TO
audiobookcovers;`. Non-superusers see only their own rows in
  `cron.job_run_details`, which is what we want.
- **Self-unscheduling only works when the command runs in the same database as
  the `cron` schema.** A command running in `audiobookcovers` cannot call
  `cron.unschedule`, because that schema only exists in `postgres`. Default to
  having the orchestrator unschedule after it observes completion — it is already
  polling. Confirm which shape the earlier test used.

### Phase 5 — guards

Between the shrink-swap and the full-table swap, the catalogue holds only
referenced OLIDs. The website is unaffected — it never looks up anything else —
but the agentic workflow would silently get zero results and write null or wrong
OLIDs into `image`.

Track this in its own column on `openlibrary_etl_state`, **not** by reusing
`status`:

```
catalogue_state : 'full' | 'reduced'      default 'full'
```

`status = 'running'` is the wrong signal: it covers the entire run, including
hours of BigQuery transforms during which the catalogue is completely intact, so
search would be disabled far longer than necessary. It is also wrong in the other
direction — a run that dies mid-swap leaves `status = 'failed'` while the
catalogue is still reduced, and search must stay blocked until someone repairs
it. The two facts are independent and need independent columns. Path A never
leaves `full` at all.

`searchOpenLibraryWorks()` reads `catalogue_state` and **throws** when `reduced`,
so the workflow fails loudly rather than corrupting data.

A third `'rebuilding'` value was considered and dropped: it adds nothing that
`catalogue_state` combined with `status` does not already express. `reduced` +
`running` is a healthy in-flight rebuild; `reduced` + `failed`/`idle` is a stuck
one needing attention. Two orthogonal columns beat one enum encoding both.

## Outstanding issues

**A full rebuild is pending and unavoidable.** Adding `subjects` and
`description` means Postgres does not have that data for any row yet. Even a
perfectly preserved checkpoint would have to ship it. Run it as
`fullRebuild: true` through Path B once Phases 2-4 land — not through the delta
path, which would grind 30M rows through individual upserts.

**The current loader is slow by construction.** `machine: "micro"` (0.25 vCPU),
one `yield` per row through four stream layers, and a single transaction wrapping
the entire delete + upsert. This is what pegged the database for days. Phase 2
replaces it wholesale.

**Legacy database objects.** The old `openlibrary_etl_state()` SQL functions
(no-arg and `text`) are superseded by the new table and unused. Drizzle does not
manage functions, so drop them manually.

## Open questions

- How large is `description` in practice? It exists only for the LLM to read a
  snippet, and the tool already truncates to 220 chars at display time.
  Truncating it at the BigQuery step would shrink the table permanently, in both
  the 1x and 2x cases — a better lever than optimising the swap window. Same
  question for `subjects`, which is unbounded per work.
- What is the real delta ratio in a normal month? Sets the Path A/B threshold;
  10% is a starting guess, not a measurement.
- How many parallel loaders before PlanetScale stops getting faster? Start at 4–8.

## Later

`pg_trgm` is available and is the cheap fix for OCR fuzzy matching in the
extract-olid search tool — the current `'simple'` config does exact-token
matching only, which is the biggest quality gap for noisy cover text. Independent
of everything above.
