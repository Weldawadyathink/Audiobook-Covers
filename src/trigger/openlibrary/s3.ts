import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { env } from "@/env";

export class s3Client {
  s3Client: S3Client;
  bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.S3_BUCKET;
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
