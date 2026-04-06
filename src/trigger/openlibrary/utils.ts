import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { DuckDBInstance } from "@duckdb/node-api";
import { env } from "@/env";

export function getFileNames(prefix: string) {
  const parquet = `${prefix}.parquet`;
  const metadata = `${prefix}.metadata`;
  return Object.assign([parquet, metadata] as const, { parquet, metadata });
}

export async function setupDuckDB(tempDirectorySize?: number) {
  fs.mkdirSync(`/tmp/duckdb/home`, { recursive: true });
  fs.mkdirSync(`/tmp/duckdb/temp`, { recursive: true });

  let db = await DuckDBInstance.create();
  let con = await db.connect();

  await con.run(`SET home_directory='/tmp/duckdb/home'`);
  await con.run(`SET temp_directory='/tmp/duckdb/temp'`);
  // Default to 9GB if not specified, since trigger.dev instances have 10GB available
  await con.run(`SET max_temp_directory_size = '${tempDirectorySize ?? 9}GB'`);

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
) {
  db = db ?? (await setupDuckDB());
  const result = await db.run(
    `SELECT COUNT(*) FROM read_parquet('s3://${env.S3_BUCKET}/${key}')`,
  );
  const rows = await result.getRows();
  const rowCount = Number(rows[0][0]);
  return rowCount;
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
