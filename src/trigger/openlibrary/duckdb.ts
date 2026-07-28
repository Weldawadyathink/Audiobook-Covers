import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { env } from "@/env.node";

/**
 * DuckDB is used here purely as bulk transport: read Parquet from GCS, write
 * rows into Postgres over its own libpq connection.
 *
 * It never runs the merge. `ON CONFLICT` semantics through the attach layer are
 * not something worth discovering at 30M rows, so every upsert and delete is
 * ordinary SQL over the normal postgres.js connection; DuckDB only ever does a
 * plain `INSERT` into a table nothing else is reading.
 */

/** DuckDB catalog alias for the attached Postgres database. */
export const PG_ALIAS = "pg";

/**
 * DuckDB needs a writable home directory before it can install an extension —
 * `INSTALL httpfs` unpacks into `<home>/.duckdb/extensions`.
 *
 * A trigger.dev container has no `HOME`, so DuckDB resolves it to the empty
 * string and the very first `INSTALL` fails with
 * `IO Error: Can't find the home directory at ''`. Pointing it at the ephemeral
 * filesystem is the fix; `/tmp` is writable and lives for the run.
 *
 * Deliberately a fixed path rather than a per-run temp dir: if the same machine
 * serves several loader runs, they reuse the already-downloaded extension
 * instead of re-fetching it from `extensions.duckdb.org` each time.
 */
const DUCKDB_HOME = join(tmpdir(), "duckdb", "home");

/** Spill target, so a query that exceeds `memory_limit` degrades instead of dying. */
const DUCKDB_TEMP = join(tmpdir(), "duckdb", "temp");

/**
 * Share of the machine's memory DuckDB may use.
 *
 * The rest is for Node, the native addon, and libpq's own buffers on the
 * attached Postgres connection. DuckDB honours this limit for its own buffer
 * manager, but the container's cgroup limit is enforced against *everything* in
 * the process — so overshooting here trades a graceful spill for an OOM kill.
 */
const MEMORY_LIMIT_RATIO = 0.7;

/**
 * Translates the trigger.dev machine preset into DuckDB resource settings.
 *
 * Uses `ctx.machine` rather than `os.totalmem()` on purpose: inside a container
 * `os.totalmem()` reports the *host's* memory, not the cgroup limit, so deriving
 * a limit from it would set DuckDB's budget far above what the container is
 * actually allowed and turn a spill into an OOM kill.
 */
function resourceSettings(machine?: { cpu?: number; memory?: number }) {
  const settings: Record<string, string> = {};

  if (machine?.memory && machine.memory > 0) {
    const limitMb = Math.max(
      Math.floor(machine.memory * 1024 * MEMORY_LIMIT_RATIO),
      256,
    );
    settings.memory_limit = `${limitMb}MB`;
  }

  if (machine?.cpu && machine.cpu > 0) {
    // Fractional vCPU floors to 0; more threads than cores just adds context
    // switching, so one thread is the honest setting on a sub-1 vCPU preset.
    settings.threads = String(Math.max(1, Math.floor(machine.cpu)));
  }

  return settings;
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * PlanetScale requires TLS, and DuckDB's postgres extension hands the string
 * straight to libpq without adding an sslmode of its own. Without this a fresh
 * connection is refused by the server, which surfaces as an opaque ATTACH
 * failure rather than anything mentioning TLS.
 */
function withRequiredSsl(connectionUrl: string) {
  const url = new URL(connectionUrl);
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

export type DuckDbSession = {
  connection: DuckDBConnection;
  close: () => void;
};

/**
 * Opens an in-memory DuckDB with GCS credentials and Postgres attached.
 *
 * **The `ETL_S3_*` credentials are already the GCS credentials.** The bucket
 * BigQuery exports to is Google Cloud Storage, reached through its
 * S3-compatible interoperability API: `ETL_S3_ENDPOINT` is
 * `https://storage.googleapis.com` and `ETL_S3_ACCESS_KEY_ID` is a `GOOG…` HMAC
 * key. DuckDB's `TYPE GCS` secret is exactly an S3 secret pinned to that API, so
 * it consumes the same key pair directly — nothing extra to provision, and no
 * service-account JSON involved.
 *
 * `ENDPOINT` and `USE_SSL` are passed explicitly rather than leaning on the
 * type's built-in default, so `ETL_S3_ENDPOINT` stays the single source of truth
 * and repointing it moves DuckDB with it instead of silently diverging.
 *
 * Note the scheme matters: a `TYPE GCS` secret serves `gs://` and `gcs://` URIs
 * only. The same bucket addressed as `s3://` finds no matching secret and fails
 * with a 404 against the wrong endpoint, so {@link gcsUris} always emits `gs://`.
 */
export async function openDuckDbSession(options?: {
  /** Attach Postgres read-write. Set false for a read-only session. */
  attachPostgres?: boolean;
  /** `ctx.machine` from the calling task, for memory and thread limits. */
  machine?: { cpu?: number; memory?: number };
}): Promise<DuckDbSession> {
  mkdirSync(DUCKDB_HOME, { recursive: true });
  mkdirSync(DUCKDB_TEMP, { recursive: true });

  // Passed as instance config rather than as `SET` statements: `home_directory`
  // has to be in place before the first `INSTALL`, and configuring at creation
  // removes any chance of a statement being reordered ahead of it later.
  const instance = await DuckDBInstance.create(":memory:", {
    home_directory: DUCKDB_HOME,
    temp_directory: DUCKDB_TEMP,
    ...resourceSettings(options?.machine),
  });
  const connection = await instance.connect();

  const close = () => {
    connection.closeSync();
    instance.closeSync();
  };

  try {
    await connection.run("INSTALL httpfs; LOAD httpfs;");

    const endpoint = new URL(env.ETL_S3_ENDPOINT);
    await connection.run(`
      CREATE OR REPLACE SECRET openlibrary_gcs (
        TYPE GCS,
        KEY_ID ${quote(env.ETL_S3_ACCESS_KEY_ID)},
        SECRET ${quote(env.ETL_S3_SECRET_ACCESS_KEY)},
        ENDPOINT ${quote(endpoint.host)},
        USE_SSL ${endpoint.protocol === "https:"}
      )
    `);

    if (options?.attachPostgres !== false) {
      await connection.run("INSTALL postgres; LOAD postgres;");
      await connection.run(
        `ATTACH ${quote(withRequiredSsl(env.DATABASE_WRITE_URL))} AS ${PG_ALIAS} (TYPE postgres)`,
      );
    }
  } catch (error) {
    close();
    throw error;
  }

  return { connection, close };
}

/**
 * `gs://bucket/key` URI list for `read_parquet`.
 *
 * `gs://`, not `s3://`. The bucket answers on both, but a `TYPE GCS` secret is
 * only matched for the `gs`/`gcs` schemes — addressing it as `s3://` finds no
 * secret and fails with a 404 against the default AWS endpoint.
 */
export function gcsUris(bucket: string, keys: string[]) {
  return keys.map((key) => `gs://${bucket}/${key}`);
}

/** SQL list literal of quoted URIs. */
export function uriListLiteral(uris: string[]) {
  return `[${uris.map(quote).join(", ")}]`;
}
