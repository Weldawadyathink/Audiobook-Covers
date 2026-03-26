import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import * as https from "https";
import * as fs from "fs";
import { pipeline } from "stream/promises";
import { env } from "@/env";

export const worksDumpUrl =
  "https://openlibrary.org/data/ol_dump_works_latest.txt.gz";
export const authorsDumpUrl =
  "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz";

export const worksParquetFile = `s3://${env.S3_BUCKET}/openlibrary/works.parquet`;
export const authorsParquetFile = `s3://${env.S3_BUCKET}/openlibrary/authors.parquet`;
export const enrichedWorksParquetFile = `s3://${env.S3_BUCKET}/openlibrary/enriched_works.parquet`;

export const enrichTmpChunkPrefix = "openlibrary/tmp/";

export const etlMetadataKey = "openlibrary/etl-metadata.json";
export const worksMetadataKey = "openlibrary/works-metadata.json";
export const authorsMetadataKey = "openlibrary/authors-metadata.json";
export const enrichedMetadataKey = "openlibrary/enriched-metadata.json";

export interface TaskMetadata {
  dump_date: string;
  row_count?: number;
  updated_at: string;
}

export function makeS3Client(): S3Client {
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

export async function getStoredMetadata(
  s3: S3Client,
  key: string,
): Promise<TaskMetadata | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as TaskMetadata;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

export async function putMetadata(
  s3: S3Client,
  key: string,
  data: TaskMetadata,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    }),
  );
}

export async function deleteMetadata(
  s3: S3Client,
  key: string,
): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
  );
}

export async function downloadS3File(
  s3: S3Client,
  key: string,
  localPath: string,
): Promise<void> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
  );
  if (!res.Body) throw new Error(`Empty body for S3 key: ${key}`);
  const writeStream = fs.createWriteStream(localPath);
  await pipeline(res.Body as NodeJS.ReadableStream, writeStream);
}

export async function deleteS3Prefix(
  s3: S3Client,
  prefix: string,
): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = listRes.Contents ?? [];
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: {
            Objects: objects.map((o) => ({ Key: o.Key! })),
            Quiet: true,
          },
        }),
      );
    }
    continuationToken = listRes.NextContinuationToken;
  } while (continuationToken);
}
