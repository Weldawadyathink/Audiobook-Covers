import {
  S3Client as defaultS3Client,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { env } from "@/env.node";

export class S3Client {
  s3Client: defaultS3Client;
  bucket: string;

  constructor(target: "default" | "etl" = "default") {
    if (target === "default") {
      this.s3Client = new defaultS3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
      this.bucket = env.S3_BUCKET;
    }
    if (target === "etl") {
      this.s3Client = new defaultS3Client({
        region: env.ETL_S3_REGION,
        endpoint: env.ETL_S3_ENDPOINT,
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: env.ETL_S3_ACCESS_KEY_ID,
          secretAccessKey: env.ETL_S3_SECRET_ACCESS_KEY,
        },
      });
      this.bucket = env.ETL_S3_BUCKET;
    }
  }

  async clearDirectory(prefix: string) {
    let continuationToken: string | undefined;
    do {
      const listRes = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = listRes.Contents ?? [];
      if (objects.length > 0) {
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
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

  async listObjects(prefix: string) {
    const objects: Array<{ key: string; size: number | undefined }> = [];
    let continuationToken: string | undefined;

    do {
      const listRes = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      objects.push(
        ...(listRes.Contents ?? [])
          .filter((object) => object.Key)
          .map((object) => ({
            key: object.Key!,
            size: object.Size,
          })),
      );
      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async deleteObjectsByWildcard(pattern: string) {
    const prefix = getPrefixBeforeWildcard(pattern);
    const matcher = wildcardToRegExp(pattern);
    let continuationToken: string | undefined;
    do {
      const listRes = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = (listRes.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => !!key && matcher.test(key));
      if (objects.length > 0) {
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objects.map((key) => ({ Key: key })),
              Quiet: true,
            },
          }),
        );
      }
      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);
  }

  async getMetadata<T extends z.ZodTypeAny>(key: string, zodParser: T) {
    const rawMetadata = await this.safeGetObject(key);
    const metadataText = await rawMetadata?.transformToString();
    const metadataJson = metadataText ? JSON.parse(metadataText) : {};
    return zodParser.safeParse(metadataJson);
  }

  async setMetadata<T extends z.ZodObject<z.ZodRawShape>>(
    key: string,
    zodParser: T,
    data: z.input<T>,
  ) {
    const metadataJson = zodParser.parse(data);
    await this.createJson(key, metadataJson);
  }

  async deleteObject(key: string | string[]) {
    if (typeof key === "string") {
      return await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } else {
      return await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: key.map((k) => ({ Key: k })) },
        }),
      );
    }
  }

  async safeDeleteObject(key: string | string[]) {
    try {
      await this.deleteObject(key);
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") {
        // Object doesn't exist, continue
      } else {
        throw error;
      }
    }
  }

  async createObject(
    key: string,
    data: Buffer,
    contentType: string,
    options: { cacheControl?: string } = {},
  ) {
    return await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async createMultipartUpload(
    key: string,
    options: {
      contentType?: string;
    } = {},
  ) {
    const result = await this.s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options.contentType,
      }),
    );
    if (!result.UploadId) {
      throw new Error(`Failed to create multipart upload for ${key}`);
    }
    return result.UploadId;
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Readable | Uint8Array,
    contentLength: number,
  ) {
    const result = await this.s3Client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: contentLength,
      }),
    );
    if (!result.ETag) {
      throw new Error(
        `Failed to upload part ${partNumber} for ${key}: missing ETag`,
      );
    }
    return result.ETag;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ ETag: string; PartNumber: number }>,
  ) {
    return await this.s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts,
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    return await this.s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async createJson(key: string, data: object) {
    return await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: "application/json",
      }),
    );
  }

  async getRawObject(key: string) {
    return await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getObjectStream(key: string) {
    const result = await this.getRawObject(key);
    const body = result.Body;
    if (!body) {
      throw new Error(`No object body returned for s3://${this.bucket}/${key}`);
    }

    if (body instanceof Readable) {
      return body;
    }

    if (typeof body.transformToWebStream === "function") {
      return Readable.fromWeb(
        body.transformToWebStream() as ReadableStream<Uint8Array>,
      );
    }

    if (Symbol.asyncIterator in body) {
      return Readable.from(body as AsyncIterable<Uint8Array>);
    }

    throw new Error(
      `Unsupported object body type for s3://${this.bucket}/${key}`,
    );
  }

  async safeGetObject(key: string) {
    try {
      const result = await this.getRawObject(key);
      const resultBody = result?.Body;
      return resultBody || null;
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") {
        return null;
      }
      throw error;
    }
  }
}

function getPrefixBeforeWildcard(pattern: string) {
  const wildcardIndex = pattern.search(/[*?]/);
  return wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
}

function wildcardToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexSource = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${regexSource}$`);
}
