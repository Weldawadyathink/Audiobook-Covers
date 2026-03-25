import { schedules } from "@trigger.dev/sdk/v3";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as https from "https";
import * as fs from "fs";
import { DuckDBInstance } from "@duckdb/node-api";
import { env } from "@/env";

const worksDumpUrl = "https://openlibrary.org/data/ol_dump_works_latest.txt.gz";
const authorsDumpUrl =
  "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz";
const metadataKey = "openlibrary/etl-metadata.json";
const tmpWorksParquetPath = "/tmp/works.parquet";
const tmpAuthorsParquetPath = "/tmp/authors.parquet";

const worksParquetFile = `s3://${env.S3_BUCKET}/openlibrary/works.parquet`;
const authorsParquetFile = `s3://${env.S3_BUCKET}/openlibrary/authors.parquet`;

interface EtlMetadata {
  dump_date: string;
  works_row_count: number;
  authors_row_count?: number;
  updated_at: string;
}

function makeS3Client(): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

// Follows the "latest" redirect to extract the dump date from the resolved URL.
// OpenLibrary redirects ol_dump_works_latest.txt.gz →
// ol_dump_works_YYYY-MM-DD.txt.gz, so the date is in the filename.
async function resolveDumpDate(url: string): Promise<string> {
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

async function getStoredMetadata(
  s3: S3Client,
  bucket: string,
): Promise<EtlMetadata | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: metadataKey }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as EtlMetadata;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

async function uploadParquet(
  s3: S3Client,
  bucket: string,
  key: string,
  localPath: string,
): Promise<void> {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: "application/octet-stream",
    },
    partSize: 100 * 1024 * 1024,
    queueSize: 2,
  });
  const toMB = (n: number) =>
    (n / 1024 / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 });
  upload.on("httpUploadProgress", (p) => {
    const total = p.total != null ? `${toMB(p.total)}` : "?";
    console.log(`Upload ${key}: ${toMB(p.loaded ?? 0)} / ${total} MB`);
  });
  await upload.done();
}

async function runEtl(): Promise<void> {
  const s3 = makeS3Client();

  console.log("Resolving latest dump date from OpenLibrary...");
  const dumpDate = await resolveDumpDate(worksDumpUrl);
  console.log(`Latest dump date: ${dumpDate}`);

  const storedMeta = await getStoredMetadata(s3, env.S3_BUCKET);
  const upToDate = storedMeta != null && storedMeta.dump_date === dumpDate;
  const worksAlreadyDone = upToDate;
  const authorsAlreadyDone = upToDate && storedMeta!.authors_row_count != null;

  if (worksAlreadyDone && authorsAlreadyDone) {
    console.log(`Already imported dump for ${dumpDate}. Skipping.`);
    return;
  }

  if (fs.existsSync(tmpWorksParquetPath)) fs.unlinkSync(tmpWorksParquetPath);
  if (fs.existsSync(tmpAuthorsParquetPath))
    fs.unlinkSync(tmpAuthorsParquetPath);

  const db = await DuckDBInstance.create("/tmp/duck.db");
  const con = await db.connect();

  let worksRows = storedMeta?.works_row_count ?? 0;
  let authorsRows: number | undefined = storedMeta?.authors_row_count;

  try {
    await con.run("SET home_directory='/tmp/duckdb_home'");
    await con.run("SET temp_directory='/tmp/duckdb_temp'");

    await con.run("SET max_temp_directory_size = '8GB'");
    await con.run("SET memory_limit = '1GB'");

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

    if (!authorsAlreadyDone) {
      console.log("Downloading authors dump and converting to Parquet");
      await con.run(`
        COPY (
          SELECT
            replace(json_extract_string(data, '$.key'), '/authors/', '') AS olid,
            json_extract_string(data, '$.name')                          AS name,
            TRY_CAST(json_extract(data, '$.eastern_order') AS BOOLEAN)  AS eastern_order,
            json_extract_string(data, '$.personal_name')                 AS personal_name,
            json_extract_string(data, '$.enumeration')                   AS enumeration,
            json_extract_string(data, '$.title')                         AS title,
            coalesce(json_extract(data, '$.alternate_names')::VARCHAR[], []::VARCHAR[]) AS alternate_names,
            coalesce(json_extract(data, '$.uris')::VARCHAR[],            []::VARCHAR[]) AS uris,
            CASE json_type(data, '$.bio')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.bio')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.bio.value')
            END AS bio,
            json_extract_string(data, '$.location')                      AS location,
            json_extract_string(data, '$.birth_date')                    AS birth_date,
            json_extract_string(data, '$.death_date')                    AS death_date,
            json_extract_string(data, '$.date')                          AS date,
            json_extract_string(data, '$.wikipedia')                     AS wikipedia,
            json_extract(data, '$.links')::VARCHAR                       AS links
          FROM read_csv(
            '${authorsDumpUrl}',
            sep           = '\t',
            header        = false,
            quote         = '',
            columns       = {type: 'VARCHAR', key: 'VARCHAR', revision: 'VARCHAR',
                             last_modified: 'VARCHAR', data: 'VARCHAR'},
            ignore_errors = true
          )
        ) TO '${authorsParquetFile}' (FORMAT PARQUET, COMPRESSION ZSTD)
      `);

      const countResult = await con.run(
        `SELECT count(*) FROM '${authorsParquetFile}'`,
      );
      const rows = await countResult.getRows();
      authorsRows = Number(rows[0][0]);
      console.log(
        `Wrote ${authorsRows.toLocaleString()} authors rows to Parquet in S3`,
      );
    }

    if (!worksAlreadyDone) {
      // Stream the gzipped TSV from OpenLibrary directly to Parquet,
      // flattening the top-level JSON fields into typed columns.
      // Complex nested types (authors, links, etc.) are kept as raw JSON VARCHAR.
      // /type/text fields are polymorphic: either a plain string or {type, value}.
      console.log("Downloading works dump and converting to Parquet");
      await con.run(`
        COPY (
          SELECT
            replace(json_extract_string(data, '$.key'), '/works/', '') AS olid,
            json_extract_string(data, '$.title')                       AS title,
            json_extract_string(data, '$.subtitle')                    AS subtitle,
            json_extract(data, '$.authors')::VARCHAR                   AS authors,
            json_extract(data, '$.translated_titles')::VARCHAR         AS translated_titles,
            coalesce(json_extract(data, '$.subjects')::VARCHAR[],        []::VARCHAR[]) AS subjects,
            coalesce(json_extract(data, '$.subject_places')::VARCHAR[],  []::VARCHAR[]) AS subject_places,
            coalesce(json_extract(data, '$.subject_times')::VARCHAR[],   []::VARCHAR[]) AS subject_times,
            coalesce(json_extract(data, '$.subject_people')::VARCHAR[],  []::VARCHAR[]) AS subject_people,
            CASE json_type(data, '$.description')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.description')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.description.value')
            END AS description,
            coalesce(json_extract(data, '$.dewey_number')::VARCHAR[],       []::VARCHAR[]) AS dewey_number,
            coalesce(json_extract(data, '$.lc_classifications')::VARCHAR[], []::VARCHAR[]) AS lc_classifications,
            CASE json_type(data, '$.first_sentence')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.first_sentence')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.first_sentence.value')
            END AS first_sentence,
            json_extract(data, '$.original_languages')::VARCHAR AS original_languages,
            coalesce(json_extract(data, '$.other_titles')::VARCHAR[], []::VARCHAR[]) AS other_titles,
            json_extract_string(data, '$.first_publish_date')   AS first_publish_date,
            json_extract(data, '$.links')::VARCHAR               AS links,
            CASE json_type(data, '$.notes')
              WHEN 'VARCHAR' THEN json_extract_string(data, '$.notes')
              WHEN 'OBJECT'  THEN json_extract_string(data, '$.notes.value')
            END AS notes,
            json_extract_string(data, '$.cover_edition.key')    AS cover_edition,
            coalesce(json_extract(data, '$.covers')::BIGINT[], []::BIGINT[]) AS covers
          FROM read_csv(
            '${worksDumpUrl}',
            sep           = '\t',
            header        = false,
            quote         = '',
            columns       = {type: 'VARCHAR', key: 'VARCHAR', revision: 'VARCHAR',
                             last_modified: 'VARCHAR', data: 'VARCHAR'},
            ignore_errors = true
          )
        ) TO '${worksParquetFile}' (FORMAT PARQUET, COMPRESSION ZSTD)
      `);

      const countResult = await con.run(
        `SELECT count(*) FROM '${worksParquetFile}'`,
      );
      const rows = await countResult.getRows();
      worksRows = Number(rows[0][0]);
      console.log(
        `Wrote ${worksRows.toLocaleString()} works rows to Parquet in S3`,
      );
    }

    const meta: EtlMetadata = {
      dump_date: dumpDate,
      works_row_count: worksRows,
      authors_row_count: authorsRows,
      updated_at: new Date().toISOString(),
    };
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: metadataKey,
        Body: JSON.stringify(meta, null, 2),
        ContentType: "application/json",
      }),
    );
    console.log("Metadata written:", meta);
  } finally {
    con.closeSync();
    db.closeSync();
    try {
      if (fs.existsSync(tmpWorksParquetPath))
        fs.unlinkSync(tmpWorksParquetPath);
    } catch {
      // ignore cleanup errors
    }
    try {
      if (fs.existsSync(tmpAuthorsParquetPath))
        fs.unlinkSync(tmpAuthorsParquetPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export const openLibraryEtlTask = schedules.task({
  id: "openlibrary-works-etl",
  cron: "0 9 * * *",
  machine: "medium-1x",
  run: async () => {
    await runEtl();
  },
});
