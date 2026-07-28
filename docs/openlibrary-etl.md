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

**`fetch_types: false` cannot decode `text[]`.** The pools in `src/db.ts` are
created with `fetch_types: false`, which skips loading the type catalogue. Dates
and integers still decode (built-in OIDs), but arrays need the _element_ type
parser, so `author_names` arrives as the raw literal string `{a,b}` and fails
`z.array(z.string())` on every row. Select array columns through
`to_jsonb(...)` — `jsonb` has a decoder that does not consult the catalogue, and
it puts the encoding in the database rather than in a hand-rolled literal parser
that mangles a title containing a comma. (`src/server/imageData.ts` predates this
and hand-rolls the parser; it is the thing to avoid, not the pattern to copy.)

**A raw backtick inside a tagged SQL template ends the string.** The same hazard
that drove BigQuery SQL out of TypeScript applies to the `sqlTools` templates
that remain. Markdown-style prose in a `--` comment inside one of those templates
is a syntax error at best and a silently truncated query at worst. Keep that
prose in the JSDoc above the function.

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
  The `setInterval` heartbeat is gone; renewal is explicit (see below).
- Checkpoint reduced to `(olid, row_hash)` — the delta query never read anything
  else from the synced side.
- BigQuery processing tables dropped after a successful run; the drop list is
  derived from the query DAG via `getProcessingTableNames()`.
- GCS retention via bucket lifecycle rule (`infra/gcs-lifecycle.json`), not inline
  deletes, so a failed run can retry without re-downloading ~12GB.
- Dead code removed: `backfill-canonical-score`, `redirects_normalized`,
  `lib/openlibrarySearch.ts`, `sync-works-for-postgres.ts` (replaced wholesale by
  the DuckDB path), the now-unused `streamTracker`, and the `node-addon-api` /
  `node-gyp` dependencies.

## Implementation

All five phases are built. The rationale below is kept because it is the part
that is expensive to rediscover; the file map says where each piece lives.

| File                           | Role                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `openlibrary/etl.ts`           | Orchestrator (`schemaTask`) + thin `schedules.task` wrapper. Owns the lease.   |
| `openlibrary/columns.ts`       | The one definition of which columns travel, and their BigQuery→Postgres types. |
| `openlibrary/export.ts`        | Checkpoint, delta measurement, Parquet export.                                 |
| `openlibrary/load-postgres.ts` | Path A / Path B orchestration, loader waves, chunked merge.                    |
| `openlibrary/load-sql.ts`      | Every Postgres statement, as pure builders (testable without `env`).           |
| `openlibrary/load-parquet.ts`  | The loader worker: one wave of shards → one `INSERT`.                          |
| `openlibrary/duckdb.ts`        | DuckDB session: GCS secret + Postgres `ATTACH`.                                |
| `openlibrary/pg-cron.ts`       | Detached DDL, one-shot scheduling, `wait.for` polling.                         |
| `openlibrary/etl-state.ts`     | Lease, run status, `catalogue_state`.                                          |

### Phase 1 — export format, export mode, and safety

1. `EXPORT DATA` writes `FORMAT PARQUET`, not gzipped JSON.

2. **Each export writes to a unique immutable prefix:**

   ```
   exports/works-for-postgres/<dumpDate>/<exportId>/part-*.parquet
   ```

   `<exportId>` is the orchestrator's run id. A retry can never collide with a
   previous run's shards, and the loader's file list is unambiguous. This is what
   made the pre-run `clearDirectory` unnecessary; it is gone. The lifecycle rule
   still sweeps the whole tree by age.

3. **Export mode is decided before BigQuery runs, not after.** The delta export
   joins against the checkpoint and emits `change_type`; a full export just dumps
   `works_for_postgres`. They are different queries producing different columns,
   so this cannot be chosen after the fact.

   The default is **delta**. A full export happens only when the run is
   explicitly asked for one — or when `catalogue_state` is already `reduced`,
   which means an earlier run died mid-swap and only a rebuild can repair it.

   This needs a payload, and `schedules.task` has a fixed payload shape, so it is
   split: `openLibraryEtlTask` is a `schemaTask` taking `{ fullRebuild?: boolean }`
   and `openLibraryEtlScheduleTask` is a thin `schedules.task` that triggers it.
   That also makes manual and parameterised runs possible.

4. **The delta ratio is measured before exporting, and the run refuses to
   guess.** One `FULL OUTER JOIN` against the checkpoint (`sql/delta_stats.sql`)
   yields all four counts in a single pass — the row hash is the expensive part,
   so it is computed once rather than once per count. Over the threshold, the run
   **aborts with the numbers it saw** rather than proceeding.

   This is deliberately the same guard as the delete blast-radius check, because
   the two situations are indistinguishable from inside the pipeline:
   - a truncated OpenLibrary dump (mostly deletes) — must not be applied
   - a legitimate schema change (mostly upserts) — needs `fullRebuild: true`

   Only a human can tell these apart, so the pipeline stops and says which
   numbers it saw. An empty checkpoint trips the same guard, since it is both
   what a first run and what a lost checkpoint look like.

### Phase 2 — DuckDB loader on trigger.dev

`@duckdb/node-api` is a dependency again, with `@duckdb/node-api` and
`@duckdb/node-bindings` marked `external` in `trigger.config.ts` — the native
addon resolves its `.node` binary relative to the wrong path if bundled.

`load-postgres.ts` lists the export objects and fans loaders out in waves of
`LOADERS_PER_WAVE`, each handling `FILES_PER_LOADER` shards read as one
`read_parquet([...])`. DuckDB parallelises those reads internally, which matters
because BigQuery emits many small files and per-file HTTP overhead would
otherwise dominate. Waves rather than one big fan-out because the task is
suspended while a wave is in flight and cannot renew the lease until it returns.

```sql
ATTACH 'dbname=… host=… user=… password=…' AS pg (TYPE postgres);
INSERT INTO pg.<target> SELECT * FROM read_parquet(['gs://…/part-000.parquet', …]);
```

`<target>` is a **permanent** table, not `TEMP`. DuckDB's `ATTACH` opens its own
libpq session and cannot see a `TEMP` table created by the connection that runs
the merge. Path A therefore uses a real `openlibrary_work_delta_stage` —
`UNLOGGED` is right there and only there, since it is purely transient and never
swapped into production. Path B has DuckDB write straight into
`openlibrary_work_new`.

The projection is explicit and by name (`duckdbInsertSql`), never `SELECT *`:
Parquet column order is whatever BigQuery emitted, and a positional mismatch
between two text columns would load silently and wrongly. Integers are cast
down — BigQuery only has INT64, Postgres wants int4, and the extension's binary
COPY does not coerce widths. Arrays are `COALESCE`d to `[]` because the target
columns are `NOT NULL DEFAULT '{}'` and a binary COPY writes an explicit NULL
rather than falling back to the default.

The merge then runs over a normal connection, in chunks, committing per chunk.
Never one long transaction: a multi-hour transaction pins the xmin horizon and
blocks autovacuum across the entire database, not just this table.

**Verified end to end** against a throwaway Postgres and a real Parquet file:
`text[]` round-trip for all four array columns, INT64 → `integer` narrowing, and
both load paths. See "Verification" below.

### Phase 3 — two load paths

**Path A — delta under ~10% (the normal month).** Load into a typed staging
table, then chunked `INSERT … ON CONFLICT` + delete, 25k rows per commit, sorted
by `olid` so btree writes stay near-sequential.

Both chunk statements walk `(change_type, olid)` with a keyset cursor, and the
cursor advances from the _chunk_, not from `RETURNING`. A staged delete whose
`olid` is already absent returns no row, so driving the cursor off `RETURNING`
would stall on it forever. The staging table gets a `(change_type, olid)` index
first, or every chunk is a full scan and sort of it.

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

-- 3. build the full table at 1x. (openlibrary_work_new is actually created
--    before step 2, so the LIKE is taken from the pristine table rather than
--    from the keep table's copy of it.)
--    LOGGED (the default) — building it UNLOGGED
--    and flipping it later rewrites the whole table, which needs exactly the
--    headroom this sequence exists to avoid.
--    Everything EXCEPT indexes, so the bulk load stays near-linear.
CREATE TABLE openlibrary_work_new (
  LIKE openlibrary_work
  INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED INCLUDING COMMENTS
);
-- … DuckDB loads every Parquet part into openlibrary_work_new …
-- Named explicitly: the auto-generated openlibrary_work_new_pkey would survive
-- the rename and drift from what db/schema.ts declares.
ALTER TABLE openlibrary_work_new
  ADD CONSTRAINT openlibrary_work_pkey PRIMARY KEY (olid);   -- via pg_cron
CREATE INDEX … ON openlibrary_work_new USING gin (…);        -- both, via pg_cron
ANALYZE openlibrary_work_new;

-- 4. swap in, drop the keep table
```

Note the asymmetry in the two `LIKE` clauses: the keep table takes
`INCLUDING ALL` because it is small and wants its indexes immediately, while the
full table deliberately omits `INCLUDING INDEXES` so 30M rows land in a heap with
no index maintenance. `PRIMARY KEY` arrives via `INCLUDING INDEXES` in Postgres,
so the full table has to add it explicitly after loading — which is what you want
anyway, since building the PK in bulk beats maintaining it per row.

All three index builds go through pg_cron, the primary key included: it is the
same disconnect hazard, and a PK build on 30M rows is not fast.

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

**The schedule is pinned so it fires once and does not naturally recur for a
year.** A concrete minute ~90 seconds out, encoding the day and month:

```
now = 2026-07-28 03:14  →  schedule '20 3 28 7 *'  →  fires 03:20 today,
                                                      next natural fire: 2027-07-28
```

One fire, a year of margin, and correctness no longer depends on pg_cron's
overlap semantics. The orchestrator unschedules once the job finishes; the
year-out pin means a missed unschedule is harmless rather than catastrophic.
Cost is up to ~1 minute of start latency, which is nothing against an hour-long
build.

The schedule string is computed from the **server's** clock in the **cron**
timezone (`COALESCE(current_setting('cron.timezone', true), 'GMT')`), not from
Node's. A pinned schedule derived from a clock or a zone the scheduler does not
share fires at the wrong time — or, given the year-out pin, a year late.

The scheduled command is prefixed with `SET maintenance_work_mem` — GIN builds on
30M rows are dominated by sort memory and the 64MB default makes them
dramatically slower. It is a USERSET GUC scoped to that one pg_cron backend, so
the blast radius is a single build, but it is still real memory on the instance.

#### Lease renewal

The `setInterval` heartbeat is gone. `wait.for` suspends the run, so the timer
never fired while asleep and the lease silently lapsed; it was `unref()`'d as
well, which made its firing unreliable regardless. In its place:

- Explicit `renewEtlLease()` at natural checkpoints: after each BigQuery query
  batch, between loader waves, around each merge stage, and immediately on every
  pg_cron poll wake-up.
- Renewal **throws** when the lease is no longer ours, so a run that has been
  taken over stops before writing anything further rather than racing the new
  owner.
- `LEASE_DURATION_SECONDS` is one hour. That is far more than a heartbeat design
  would need, because the TTL has to cover the longest gap between two _awake_
  moments — a wave of Parquet loaders, during which the task is suspended. This
  job runs monthly, so a crashed run blocking retries for up to an hour costs
  nothing, while a TTL that expires mid-run lets a second run write alongside the
  first.
- The lease belongs to the _pipeline for one dump_, not to a single trigger.dev
  run. `openLibraryLoadPostgresTask` therefore takes the orchestrator's run id as
  `leaseRunId` and renews on its behalf, since the orchestrator is suspended in
  `triggerAndWait` for the whole load.

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
  `cron.unschedule`, because that schema only exists in `postgres`. So the
  orchestrator unschedules after it observes completion — it is already polling.
  This is best-effort and failure is logged, not fatal: the year-out pin means a
  leaked schedule does nothing until next year.

### Phase 5 — guards

Between the shrink-swap and the full-table swap, the catalogue holds only
referenced OLIDs. The website is unaffected — it never looks up anything else —
but the agentic workflow would silently get zero results and write null or wrong
OLIDs into `image`.

This is tracked in its own column on `openlibrary_etl_state`, **not** by
reusing `status`:

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

`searchOpenLibraryWorks()` reads `catalogue_state` and **throws** when
`reduced`, so the workflow fails loudly rather than corrupting data. Returning
`[]` would be worse than useless: an empty result is indistinguishable from "no
such book", and the caller's response to that is to write a null or guessed OLID
into `image` — corruption that outlives the rebuild window. The check is a
single-row primary key lookup, free next to a full-text scan of 30M rows.

The flag is set to `reduced` _before_ the first swap, not after. Erring towards
`reduced` costs a few seconds of unnecessarily blocked search; erring the other
way corrupts data. It is deliberately not cleared by `failEtlRun` — a run that
dies mid-swap must leave search blocked — and a later run seeing `reduced` at
startup forces Path B, since only a rebuild can repair it.

A third `'rebuilding'` value was considered and dropped: it adds nothing that
`catalogue_state` combined with `status` does not already express. `reduced` +
`running` is a healthy in-flight rebuild; `reduced` + `failed`/`idle` is a stuck
one needing attention. Two orthogonal columns beat one enum encoding both.

## Outstanding issues

**A full rebuild is pending and unavoidable.** Adding `subjects` and
`description` means Postgres does not have that data for any row yet. Even a
perfectly preserved checkpoint would have to ship it. Trigger
`openLibraryEtlTask` with `{ fullRebuild: true }`. The delta-ratio guard would
stop the run anyway and say so, since the checkpoint change is exactly the
"legitimate schema change" case it exists to catch.

**Human actions still required.** None of these are things an agent should run:

- `task db:push:dev` / `task db:push:prod` for the new `catalogue_state` column
  and its check constraint.
- Apply the GCS lifecycle rule from `infra/gcs-lifecycle.json` if it is not
  already applied.
- `GRANT USAGE ON SCHEMA cron TO audiobookcovers;` in the `postgres` database,
  and confirm the role may call `cron.schedule_in_database`.
- Confirm `DATABASE_WRITE_URL` names the application database in its path — the
  pg_cron helper derives both the admin URL and the target database name from
  it.
- Drop the superseded `openlibrary_etl_state()` SQL functions (no-arg and
  `text`). Drizzle does not manage functions.

**Unverified against real infrastructure.** The load SQL and the DuckDB
transport are verified (below), but three things could only be reasoned about:
the BigQuery Parquet export itself, DuckDB reading `gs://` with an HMAC GCS
secret, and pg_cron on PlanetScale specifically. A first run should be watched.

## Verification

The Postgres and DuckDB halves were exercised against a throwaway
`postgres:16-alpine` and a real Parquet file, using the shipped statement
builders in `load-sql.ts` rather than copies — which is why those builders are a
separate module with no `env` dependency.

Covered: `text[]` round-trip through Parquet, INT64 → `integer` narrowing, the
chunked delete loop terminating when a staged `olid` is absent from the target,
`ON CONFLICT` updating in place, `LIKE … INCLUDING ALL` carrying the primary key
/ check constraint / `NOT NULL` / indexes that CTAS would have dropped, the new
table having no indexes and still being `LOGGED`, the primary key landing as
`openlibrary_work_pkey` rather than `openlibrary_work_new_pkey`, both swaps
leaving no stray tables, and the rebuilt GIN index actually being chosen by the
expression `work-search.ts` issues.

Separately, the rendered BigQuery SQL is checked for unsubstituted placeholders
and for the `r'\d{4}'` escape surviving — the regression that made
`first_publish_year` NULL for most works.

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
