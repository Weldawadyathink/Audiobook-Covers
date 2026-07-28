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
   ▼
GCS  gs://<ETL_S3_BUCKET>/exports/works-for-postgres/*.parquet   (1-day lifecycle)
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
  conditional `INSERT … ON CONFLICT DO UPDATE … WHERE`, 5-minute lease with a
  60s heartbeat, expired-lease takeover, run-scoped mutations. Verified against a
  real Postgres with 33 assertions including a 12-way parallel claim storm.
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

### Phase 1 — export format and safety

1. Switch `EXPORT DATA` from gzipped JSON to `FORMAT PARQUET`.
2. **Delete blast-radius guard.** OpenLibrary has shipped truncated dumps before.
   Abort the transaction if deletes exceed a few percent of `openlibrary_work`,
   or if the `works_for_postgres` row count dropped materially against the
   checkpoint. Nothing currently stops a partial dump from emptying the table.

Both are independent of the loader rewrite and useful immediately.

### Phase 2 — DuckDB loader on trigger.dev

Restore `@duckdb/node-api` plus the `external` entry in `trigger.config.ts`
(removed when the old DuckDB helpers were deleted).

Orchestrator lists the export objects and fans out N loaders via the existing
`batchTriggerAndWait`. Each loader gets a **list** of files and reads them as one
glob — DuckDB parallelises the reads internally, which matters because BigQuery
emits many small files and per-file HTTP overhead otherwise dominates.

```sql
ATTACH 'dbname=… host=… user=… password=…' AS pg (TYPE postgres);
INSERT INTO pg.<target> SELECT * FROM read_parquet(['gs://…/a.parquet', …]);
```

Then the merge runs over a normal connection, in chunks, committing per chunk.
Never one long transaction: a multi-hour transaction pins the xmin horizon and
blocks autovacuum across the entire database, not just this table.

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
-- 1. tiny table of what the website actually needs
CREATE TABLE openlibrary_work_keep AS
SELECT * FROM openlibrary_work
WHERE olid IN (SELECT DISTINCT openlibrary_work_id FROM image
               WHERE openlibrary_work_id IS NOT NULL);
ALTER TABLE openlibrary_work_keep ADD PRIMARY KEY (olid);
-- + the two GIN indexes; trivial at this size

-- 2. swap it in, then DROP the big one — reclaims immediately
BEGIN;
  SET LOCAL lock_timeout = '10s';
  ALTER TABLE openlibrary_work      RENAME TO openlibrary_work_old;
  ALTER TABLE openlibrary_work_keep RENAME TO openlibrary_work;
COMMIT;
DROP TABLE openlibrary_work_old;

-- 3. build the full table from Parquet at 1x, index, ANALYZE, swap, drop keep
```

`lock_timeout` so the `ACCESS EXCLUSIVE` grab fails fast instead of queueing
behind a long reader and blocking every query on the table. `ANALYZE` before the
swap — after replacing 30M rows the planner is working from stale statistics,
which is an easy way to make the app feel broken after a "successful" load.

Session settings for the load: `synchronous_commit = off` (safe — the whole load
is re-runnable from the hash checkpoint), `maintenance_work_mem` as high as
permitted before `CREATE INDEX`, plus `max_parallel_maintenance_workers` if
exposed. Use plain `CREATE INDEX`, never `CONCURRENTLY`: the new table is not
visible to any reader, so a concurrent build is pure overhead.

### Phase 4 — pg_cron for long DDL, and cost

`pg_cron` is supported on PlanetScale (1.6.7 on PG 18.4, 1.6.5 on 17.10).
One-off jobs work by unscheduling once complete.

The point is billing: trigger.dev's `wait.for` / `wait.until` checkpoints the run
so the sleep is not billed. Previously a worker was kept alive holding a Postgres
connection, which burned compute for hours. Instead:

```
schedule the CREATE INDEX / swap via pg_cron
close the Postgres connection
loop:
  wait.for({ minutes: 5 })          ← not billed
  reconnect → poll → disconnect
    cron.job_run_details            → succeeded / failed
    pg_stat_progress_create_index   → live % while running
unschedule, verify the index exists, continue
```

Polling `pg_stat_progress_create_index` makes each wake-up informative rather
than blind, which matters for a step that may run an hour.

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

Between the shrink-swap and the full-table swap, the catalogue is incomplete.
`searchOpenLibraryWorks()` should read `openlibrary_etl_state` and **throw** when
`status = 'running'`, so the agentic workflow fails loudly instead of silently
returning zero results and writing null or wrong OLIDs into `image`. This is a
stronger guarantee than remembering to pause it manually.

## Outstanding issues

**A full-table upsert is pending and unavoidable.** Adding `subjects` and
`description` means Postgres does not have that data for any row yet. Even a
perfectly preserved checkpoint would have to ship it.

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
