import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { S3Client } from "@/trigger/openlibrary/s3";

export const openLibraryDownloadToS3Task = schemaTask({
  id: "openlibrary-download-to-s3",
  machine: "micro",
  retry: {
    maxAttempts: 1,
  },
  schema: z.object({
    destinationKey: z.string(),
    sourceUrl: z.url(),
  }),
  run: async ({ destinationKey, sourceUrl }) => {
    const s3 = new S3Client("etl");
    console.log(
      `Streaming ${sourceUrl} to s3://${s3.bucket}/${destinationKey}`,
    );

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download ${sourceUrl}: ${response.status} ${response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error(`No response body returned for ${sourceUrl}`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : undefined;
    if (Number.isNaN(contentLength)) {
      throw new Error(
        `Invalid content-length header for ${sourceUrl}: ${contentLengthHeader}`,
      );
    }

    const contentEncoding =
      response.headers.get("content-encoding") ?? undefined;
    const contentType = response.headers.get("content-type") ?? undefined;
    const uploadBody = Readable.fromWeb(response.body as NodeReadableStream);
    const uploadResult = await s3.uploadStream(destinationKey, uploadBody, {
      contentEncoding,
      contentLength,
      contentType,
    });

    console.log(
      `Successfully uploaded ${sourceUrl} to s3://${s3.bucket}/${destinationKey}`,
    );

    return {
      bucket: s3.bucket,
      contentLength: contentLength ?? null,
      contentType: contentType ?? null,
      destinationKey,
      etag: uploadResult.ETag ?? null,
      finalUrl: response.url,
    };
  },
});
