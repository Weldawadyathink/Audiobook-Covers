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
import { z } from "zod/v4";

const envSchema = z.object({
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string(),
  S3_ENDPOINT: z.string().optional(),
});

function getEnv() {
  return envSchema.parse(process.env);
}

const DUMP_URL = "https://openlibrary.org/data/ol_dump_works_latest.txt.gz";
const METADATA_KEY = "openlibrary/etl-metadata.json";
const PARQUET_KEY = "openlibrary/works.parquet";
const TMP_PARQUET_PATH = "/tmp/works.parquet";

interface EtlMetadata {
  dump_date: string;
  row_count: number;
  updated_at: string;
}

function makeS3Client(): S3Client {
  const env = getEnv();
  return new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

// Follows redirects to read Last-Modified for freshness check
async function getDumpDate(url: string): Promise<string> {
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
    if (statusCode === 301 || statusCode === 302) {
      const loc = headers["location"];
      if (!loc) throw new Error("Redirect with no Location header");
      current = Array.isArray(loc) ? loc[0] : loc;
      continue;
    }
    const lm = headers["last-modified"];
    if (!lm) throw new Error("No Last-Modified header on dump URL");
    const raw = Array.isArray(lm) ? lm[0] : lm;
    return new Date(raw).toISOString().slice(0, 10);
  }
  throw new Error("Too many redirects fetching dump URL");
}

async function getStoredMetadata(
  s3: S3Client,
  bucket: string,
): Promise<EtlMetadata | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: METADATA_KEY }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as EtlMetadata;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

async function runEtl(): Promise<void> {
  const { S3_BUCKET: bucket } = getEnv();
  const s3 = makeS3Client();

  console.log("Fetching dump date from OpenLibrary...");
  const dumpDate = await getDumpDate(DUMP_URL);
  console.log(`Dump date: ${dumpDate}`);

  const storedMeta = await getStoredMetadata(s3, bucket);
  if (storedMeta && storedMeta.dump_date.slice(0, 7) === dumpDate.slice(0, 7)) {
    console.log(
      `Already imported dump for ${dumpDate.slice(0, 7)} (stored: ${storedMeta.dump_date}). Skipping.`,
    );
    return;
  }

  if (fs.existsSync(TMP_PARQUET_PATH)) fs.unlinkSync(TMP_PARQUET_PATH);

  const db = await DuckDBInstance.create(":memory:");
  const con = await db.connect();

  try {
    await con.run("SET home_directory='/tmp'");
    await con.run("INSTALL httpfs");
    await con.run("LOAD httpfs");

    // Stream the gzipped TSV from OpenLibrary directly to Parquet,
    // flattening the top-level JSON fields into typed columns.
    // Complex nested types (authors, links, etc.) are kept as raw JSON VARCHAR.
    // /type/text fields are polymorphic: either a plain string or {type, value}.
    console.log("Downloading dump and converting to Parquet");
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
          '${DUMP_URL}',
          sep           = '\t',
          header        = false,
          quote         = '',
          columns       = {type: 'VARCHAR', key: 'VARCHAR', revision: 'VARCHAR',
                           last_modified: 'VARCHAR', data: 'VARCHAR'},
          ignore_errors = true
        )
        WHERE type = '/type/work'
      ) TO '${TMP_PARQUET_PATH}' (FORMAT PARQUET, COMPRESSION ZSTD)
    `);

    const countResult = await con.run(
      `SELECT count(*) FROM '${TMP_PARQUET_PATH}'`,
    );
    const rows = await countResult.getRows();
    const totalRows = Number(rows[0][0]);
    console.log(`Wrote ${totalRows.toLocaleString()} rows to Parquet.`);

    console.log("Uploading works.parquet to S3...");
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: PARQUET_KEY,
        Body: fs.createReadStream(TMP_PARQUET_PATH),
        ContentType: "application/octet-stream",
      },
      partSize: 100 * 1024 * 1024,
      queueSize: 2,
    });
    const toMB = (n: number) =>
      (n / 1024 / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 });
    upload.on("httpUploadProgress", (p) => {
      const total = p.total != null ? `${toMB(p.total)}` : "?";
      console.log(`Upload: ${toMB(p.loaded ?? 0)} / ${total} MB`);
    });
    await upload.done();

    const meta: EtlMetadata = {
      dump_date: dumpDate,
      row_count: totalRows,
      updated_at: new Date().toISOString(),
    };
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: METADATA_KEY,
        Body: JSON.stringify(meta, null, 2),
        ContentType: "application/json",
      }),
    );
    console.log("Metadata written:", meta);
  } finally {
    con.closeSync();
    db.closeSync();
    try {
      if (fs.existsSync(TMP_PARQUET_PATH)) fs.unlinkSync(TMP_PARQUET_PATH);
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
