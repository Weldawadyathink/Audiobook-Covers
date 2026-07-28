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
 * The GCS secret uses the same HMAC key pair as the S3-compatible client
 * elsewhere in the ETL — `TYPE GCS` is DuckDB's name for exactly that, so no
 * additional credential is needed.
 */
export async function openDuckDbSession(options?: {
  /** Attach Postgres read-write. Set false for a read-only session. */
  attachPostgres?: boolean;
}): Promise<DuckDbSession> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  const close = () => {
    connection.closeSync();
    instance.closeSync();
  };

  try {
    await connection.run("INSTALL httpfs; LOAD httpfs;");
    await connection.run(`
      CREATE OR REPLACE SECRET openlibrary_gcs (
        TYPE GCS,
        KEY_ID ${quote(env.ETL_S3_ACCESS_KEY_ID)},
        SECRET ${quote(env.ETL_S3_SECRET_ACCESS_KEY)}
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

/** `gs://bucket/key` URI list for `read_parquet`. */
export function gcsUris(bucket: string, keys: string[]) {
  return keys.map((key) => `gs://${bucket}/${key}`);
}

/** SQL list literal of quoted URIs. */
export function uriListLiteral(uris: string[]) {
  return `[${uris.map(quote).join(", ")}]`;
}

export { quote as quoteSqlString };
