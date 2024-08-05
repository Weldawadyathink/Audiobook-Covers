import { image } from "@/server/db/schema";
import { db } from "@/server/db";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { _Object } from "@aws-sdk/client-s3";
import { blurhashEncode } from "@/server/utils/blurhash";

async function forEachS3File(callback: (_: _Object) => Promise<unknown>) {
  const s3 = new S3Client({
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    endpoint: process.env.S3_ENDPOINT,
  });

  const bucketName = process.env.S3_BUCKET!;
  const prefix = "original/";

  async function internalListObjects(
    callback: (_: _Object) => Promise<unknown>,
    token: string | null = null,
  ) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    if (token) {
      command.input.ContinuationToken = token;
    }

    try {
      const response = await s3.send(command);
      for (const content of response.Contents ?? []) {
        await callback(content);
      }
      if (response.IsTruncated) {
        await internalListObjects(callback, response.NextContinuationToken);
      }
    } catch (error) {
      console.error("Error occurred while listing objects", error);
    }
  }

  await internalListObjects(callback);
}

async function main() {
  const fileNames: Array<string> = [];

  await forEachS3File(async (obj) => {
    if (!obj.Key) {
      return;
    }
    const fileName = obj.Key.split("/")[1]!;
    fileNames.push(fileName);
  });

  console.log("Fetched all filenames");

  const fileData: Array<{ id: string; extension: string; hash: string }> =
    await Promise.all(
      fileNames.map(async (name) => {
        const url = `https://f001.backblazeb2.com/file/com-audiobookcovers/original/${name}`;
        const hash = await blurhashEncode(url).catch((_) => "");
        console.log(`Hashed ${name}`);
        return {
          id: name.split(".")[0]!,
          extension: name.split(".")[1]!,
          hash: hash,
        };
      }),
    );

  console.log("Finished hashing images");

  const seen: Array<string> = [];
  const duplicates: Array<string> = [];
  for (const { hash } of fileData) {
    if (seen.includes(hash)) {
      duplicates.push(hash);
    } else {
      seen.push(hash);
    }
  }

  const filteredFileData = fileData.filter((d) => !duplicates.includes(d.hash));
  const duplicateFileData = fileData.filter((d) => duplicates.includes(d.hash));

  console.log("Filtered objects");

  await db.insert(image).values(filteredFileData);

  console.log("Finished database insert");

  console.log(duplicateFileData);
}

void main();
