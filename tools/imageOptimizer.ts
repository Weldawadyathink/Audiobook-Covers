import * as crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  type _Object,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const s3 = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  endpoint: process.env.S3_ENDPOINT,
});

async function optimizeImage(url: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const image = await sharp(buffer)
    .toFormat("jpg", { mozjpeg: true, quality: 70 })
    .toBuffer();

  const originalFilename = url.split("/").pop()!;
  const originalId = originalFilename.split(".")[0]!;

  return {
    id: originalId,
    image: image,
  };
}

async function putImage(props: { id: string; image: Buffer }, retries = 0) {
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: `optimized/${props.id}.jpg`,
    Body: props.image,
  };
  await s3.send(new PutObjectCommand(params)).catch(() => {
    if (retries < 5) {
      console.error(`Error with ${props.id}, retrying...`);
      return putImage(props, retries + 1);
    } else {
      console.error(`Error with ${props.id}, too many retries`);
    }
  });
  console.log(`Optimized ${props.id}`);
}

async function getAllS3Files(
  bucket: string,
  prefix: string,
): Promise<Array<_Object>> {
  async function internalListObjects(
    token: string | null = null,
  ): Promise<Array<_Object>> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    if (token) {
      command.input.ContinuationToken = token;
    }

    const response = await s3.send(command);
    if (response.IsTruncated) {
      return [
        ...(response.Contents ?? []),
        ...(await internalListObjects(response.NextContinuationToken)),
      ];
    } else {
      return response.Contents ?? [];
    }
  }

  return internalListObjects();
}

function difference(objects1: _Object[], objects2: _Object[]) {
  const set1 = objects1.map((i) => i.Key!.split("/").pop()!.split(".")[0]!);
  const set2 = objects2.map((i) => i.Key!.split("/").pop()!.split(".")[0]!);
  const diff = set1.filter((name) => !set2.includes(name));
  return objects1.filter((i) => {
    const id = i.Key!.split("/").pop()!.split(".")[0]!;
    return diff.includes(id);
  });
}

async function main() {
  const bucketName = process.env.S3_BUCKET!;

  const originalImages = await getAllS3Files(bucketName, "original/");
  const optimizedImages = await getAllS3Files(bucketName, "optimized/");

  const unoptimizedImages = difference(originalImages, optimizedImages);

  console.log(`Found ${unoptimizedImages.length} images to optimize`);

  const images = await Promise.all(
    unoptimizedImages.map(async (file) => {
      const url = `https://f001.backblazeb2.com/file/com-audiobookcovers/${file.Key}`;
      return optimizeImage(url);
    }),
  );
  console.log(`Optimized ${images.length} images`);

  await Promise.all(images.map(putImage));

  console.log("Complete");
  process.exit(0);
}

void main();

// Started with 4747 files
