import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { S3Client } from "@/trigger/openlibrary/s3";

const PART_SIZE_BYTES = 64 * 1024 * 1024;
const PART_MAX_ATTEMPTS = 3;
const PART_RETRY_BASE_DELAY_MS = 1_000;

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
    const startedAt = Date.now();
    console.log(
      `Preparing ranged download from ${sourceUrl} to s3://${s3.bucket}/${destinationKey}`,
    );

    const headResponse = await fetch(sourceUrl, {
      method: "HEAD",
      headers: {
        "accept-encoding": "identity",
      },
    });
    if (!headResponse.ok) {
      throw new Error(
        `Failed to resolve ${sourceUrl}: ${headResponse.status} ${headResponse.statusText}`,
      );
    }

    const contentLengthHeader = headResponse.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : undefined;
    if (Number.isNaN(contentLength)) {
      throw new Error(
        `Invalid content-length header for ${sourceUrl}: ${contentLengthHeader}`,
      );
    }
    if (!contentLength || contentLength <= 0) {
      throw new Error(`Missing content-length for ${sourceUrl}`);
    }

    const acceptRanges = headResponse.headers.get("accept-ranges");
    if (acceptRanges !== null && !acceptRanges.includes("bytes")) {
      throw new Error(
        `Source does not advertise byte ranges: ${sourceUrl} (accept-ranges=${acceptRanges})`,
      );
    }

    const contentType =
      headResponse.headers.get("content-type") ?? "application/octet-stream";
    const resolvedUrl = headResponse.url;
    const partCount = Math.ceil(contentLength / PART_SIZE_BYTES);
    console.log(
      [
        `Resolved source URL: ${resolvedUrl}`,
        `Size: ${formatBytes(contentLength)}`,
        `Part size: ${formatBytes(PART_SIZE_BYTES)}`,
        `Parts: ${partCount}`,
        `Content-Type: ${contentType}`,
      ].join(" | "),
    );

    const uploadId = await s3.createMultipartUpload(destinationKey, {
      contentType,
    });
    const completedParts: Array<{ ETag: string; PartNumber: number }> = [];
    let uploadedBytes = 0;
    console.log(
      `Created multipart upload ${uploadId} for s3://${s3.bucket}/${destinationKey}`,
    );

    try {
      for (let partNumber = 1; partNumber <= partCount; partNumber++) {
        const start = (partNumber - 1) * PART_SIZE_BYTES;
        const end = Math.min(start + PART_SIZE_BYTES, contentLength) - 1;
        const expectedLength = end - start + 1;
        console.log(
          `Starting part ${partNumber}/${partCount} (${formatBytes(expectedLength)}) for bytes=${start}-${end}`,
        );
        const etag = await transferPartWithRetries({
          contentLength,
          destinationKey,
          expectedLength,
          partCount,
          partNumber,
          resolvedUrl,
          s3,
          start,
          end,
          uploadId,
        });
        completedParts.push({ ETag: etag, PartNumber: partNumber });
        uploadedBytes += expectedLength;

        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
        const bytesPerSecond = uploadedBytes / elapsedSeconds;
        const remainingBytes = contentLength - uploadedBytes;
        const etaSeconds =
          bytesPerSecond > 0 ? Math.ceil(remainingBytes / bytesPerSecond) : null;
        console.log(
          [
            `Completed part ${partNumber}/${partCount}`,
            `Progress: ${formatPercent(uploadedBytes / contentLength)} (${formatBytes(uploadedBytes)}/${formatBytes(contentLength)})`,
            `Throughput: ${formatBytes(bytesPerSecond)}/s`,
            `Elapsed: ${formatDuration(elapsedSeconds)}`,
            `ETA: ${etaSeconds === null ? "unknown" : formatDuration(etaSeconds)}`,
          ].join(" | "),
        );
      }

      const completeResult = await s3.completeMultipartUpload(
        destinationKey,
        uploadId,
        completedParts,
      );

      console.log(
        `Successfully uploaded ${resolvedUrl} to s3://${s3.bucket}/${destinationKey}`,
      );

      return {
        bucket: s3.bucket,
        contentLength,
        contentType,
        destinationKey,
        etag: completeResult.ETag ?? null,
        finalUrl: resolvedUrl,
        partCount,
      };
    } catch (error) {
      console.error(`Multipart upload failed for ${destinationKey}`, error);
      await s3.abortMultipartUpload(destinationKey, uploadId);
      console.log(
        `Aborted multipart upload ${uploadId} for s3://${s3.bucket}/${destinationKey}`,
      );
      throw error;
    }
  },
});

async function transferPartWithRetries({
  contentLength,
  destinationKey,
  end,
  expectedLength,
  partCount,
  partNumber,
  resolvedUrl,
  s3,
  start,
  uploadId,
}: {
  contentLength: number;
  destinationKey: string;
  end: number;
  expectedLength: number;
  partCount: number;
  partNumber: number;
  resolvedUrl: string;
  s3: S3Client;
  start: number;
  uploadId: string;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
    let response: Response | undefined;
    try {
      console.log(
        `Part ${partNumber}/${partCount} attempt ${attempt}/${PART_MAX_ATTEMPTS} | bytes=${start}-${end}`,
      );
      response = await fetch(resolvedUrl, {
        headers: {
          "accept-encoding": "identity",
          range: `bytes=${start}-${end}`,
        },
      });
      if (response.status !== 206) {
        throw new Error(
          `Range request for part ${partNumber} returned ${response.status} ${response.statusText}`,
        );
      }
      if (!response.body) {
        throw new Error(`No response body returned for part ${partNumber}`);
      }

      const partContentLengthHeader = response.headers.get("content-length");
      const partContentLength = partContentLengthHeader
        ? Number.parseInt(partContentLengthHeader, 10)
        : undefined;
      if (partContentLength !== expectedLength) {
        throw new Error(
          `Part ${partNumber} length mismatch: expected ${expectedLength}, got ${partContentLengthHeader ?? "missing"}`,
        );
      }

      const contentRange = response.headers.get("content-range");
      const expectedContentRange = `bytes ${start}-${end}/${contentLength}`;
      if (contentRange !== expectedContentRange) {
        throw new Error(
          `Part ${partNumber} content-range mismatch: expected "${expectedContentRange}", got "${contentRange}"`,
        );
      }

      const partBody = Readable.fromWeb(response.body as NodeReadableStream);
      return await s3.uploadPart(
        destinationKey,
        uploadId,
        partNumber,
        partBody,
        expectedLength,
      );
    } catch (error) {
      lastError = error;
      const summary = formatErrorSummary(error);
      if (attempt >= PART_MAX_ATTEMPTS) {
        console.error(
          `Part ${partNumber}/${partCount} failed after ${attempt} attempts | ${summary}`,
        );
        throw error;
      }
      const delayMs = PART_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Part ${partNumber}/${partCount} attempt ${attempt}/${PART_MAX_ATTEMPTS} failed | ${summary} | retrying in ${formatDuration(delayMs / 1000)}`,
      );
      await sleep(delayMs);
    } finally {
      try {
        await response?.body?.cancel();
      } catch {
        // Ignore cleanup failures from already-consumed or errored streams.
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Part ${partNumber} failed with a non-Error value`);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(Math.round(totalSeconds), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainderSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainderSeconds}s`;
  }
  return `${remainderSeconds}s`;
}

function formatErrorSummary(error: unknown) {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? ` | cause: ${error.cause.name}: ${error.cause.message}`
        : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
