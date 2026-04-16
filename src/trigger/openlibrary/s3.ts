import {
  S3Client as defaultS3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { env } from "@/env";
import { z } from "zod/v4";

export class S3Client {
  s3Client: defaultS3Client;
  bucket: string;

  constructor() {
    this.s3Client = new defaultS3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.S3_BUCKET;
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

  async setMetadata<T extends z.ZodObject<any>>(
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

  async createObject(key: string, data: Buffer, contentType: string) {
    return await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
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
