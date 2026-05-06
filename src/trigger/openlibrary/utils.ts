import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import os from "node:os";
import type { Context } from "@trigger.dev/sdk/v3";
import { DuckDBInstance } from "@duckdb/node-api";
import postgres from "postgres";
import { env } from "@/env";
import { Transform } from "node:stream";

const AUTO_MEMORY_LIMIT_RATIO = 0.8;
const FALLBACK_MEMORY_LIMIT_GB = 0.5;
const BIGQUERY_LOCATION = "us-west1";
const BIGQUERY_PAGE_SIZE = 100_000;

export function getFileNames(prefix: string) {
  const parquet = `${prefix}.parquet`;
  const metadata = `${prefix}.metadata`;
  return Object.assign([parquet, metadata] as const, { parquet, metadata });
}

export async function setupDuckDB(ctx: Context) {
  fs.mkdirSync(`/tmp/duckdb/home`, { recursive: true });
  fs.mkdirSync(`/tmp/duckdb/temp`, { recursive: true });

  let db = await DuckDBInstance.create();
  let con = await db.connect();

  await con.run(`SET home_directory='/tmp/duckdb/home'`);
  await con.run(`SET temp_directory='/tmp/duckdb/temp'`);
  // Default to 9GB, since trigger.dev instances have 10GB available
  await con.run(`SET max_temp_directory_size = '9GB'`);
  await con.run(`SET threads = 1`);
  const derivedMemoryLimitGb =
    ctx.machine?.memory && ctx.machine.memory > 0
      ? ctx.machine.memory * AUTO_MEMORY_LIMIT_RATIO
      : (() => {
          const totalMemoryBytes = os.totalmem();
          return totalMemoryBytes > 0
            ? (totalMemoryBytes * AUTO_MEMORY_LIMIT_RATIO) /
                (1024 * 1024 * 1024)
            : FALLBACK_MEMORY_LIMIT_GB;
        })();
  console.log(
    `Starting duckDB with memory limit: ${derivedMemoryLimitGb.toFixed(2)}GB`,
  );
  await con.run(`SET memory_limit = '${derivedMemoryLimitGb.toFixed(2)}GB'`);

  await con.run("INSTALL httpfs");
  await con.run("LOAD httpfs");

  await con.run(`
    CREATE OR REPLACE SECRET secret (
      type s3,
      endpoint '${env.S3_ENDPOINT.replace("https://", "")}',
      region '${env.S3_REGION}',
      key_id '${env.S3_ACCESS_KEY_ID}',
      secret '${env.S3_SECRET_ACCESS_KEY}'
    );
  `);

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    con.closeSync();
  };

  return Object.assign(con, { [Symbol.asyncDispose]: dispose });
}

export async function getParquetRowCount(
  key: string,
  db?: Awaited<ReturnType<typeof setupDuckDB>>,
  ctx?: Context,
) {
  if (!db) {
    if (!ctx) {
      throw new Error("ctx is required when getParquetRowCount creates DuckDB");
    }
    await using db = await setupDuckDB(ctx);
    // Keep the `await using` scope alive until the recursive count query finishes.
    return await getParquetRowCount(key, db, ctx);
  }
  try {
    const result = await db.run(
      `SELECT COUNT(*) FROM read_parquet('s3://${env.S3_BUCKET}/${key}')`,
    );
    const rows = await result.getRows();
    const rowCount = Number(rows[0][0]);
    return rowCount;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes("HTTP 404 Not Found") ||
      message.includes("HTTP GET error reading")
    ) {
      return 0;
    }
    throw e;
  }
}

// Follows the "latest" redirect to extract the dump date from the resolved URL.
// OpenLibrary redirects ol_dump_works_latest.txt.gz →
// ol_dump_works_YYYY-MM-DD.txt.gz, so the date is in the filename.
export async function resolveDumpDate(url: string): Promise<string> {
  let current = url;
  for (let hops = 0; hops < 5; hops++) {
    const { statusCode, headers } = await new Promise<{
      statusCode: number;
      headers: Record<string, string | string[]>;
    }>((resolve, reject) => {
      const req = https.request(current, { method: "HEAD" }, (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[]>,
        });
      });
      req.on("error", reject);
      req.end();
    });
    if (
      statusCode === 301 ||
      statusCode === 302 ||
      statusCode === 307 ||
      statusCode === 308
    ) {
      const loc = headers["location"];
      if (!loc) throw new Error("Redirect with no Location header");
      current = Array.isArray(loc) ? loc[0] : loc;
      continue;
    }
    const match = current.match(/(\d{4}-\d{2}-\d{2})\.txt\.gz/);
    if (!match)
      throw new Error(`Could not extract dump date from URL: ${current}`);
    return match[1];
  }
  throw new Error("Too many redirects resolving dump URL");
}

export async function clearDirectory(dirPath: string) {
  // Clear directory without removing the directory itself
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
    }
  } catch (error) {
    // Possible permissions error, ignore
  }
}

export function streamTracker(
  runEvery: number,
  callback: (rowCount: number, time: number) => unknown,
) {
  let rowCount = 0;
  let lastReported = 0;
  let lastTime: number | undefined = undefined;
  return new Transform({
    objectMode: true,
    transform(chunk, _, done) {
      if (lastTime === undefined) {
        lastTime = performance.now();
        callback(rowCount, 0);
      }
      rowCount++;
      if (rowCount % runEvery === 0) {
        lastReported = rowCount;
        callback(rowCount, performance.now() - lastTime);
        lastTime = performance.now();
      }
      return done(null, chunk);
    },
    flush(done) {
      if (rowCount !== lastReported) {
        callback(rowCount, performance.now() - lastTime!);
      }
      done();
    },
  });
}
