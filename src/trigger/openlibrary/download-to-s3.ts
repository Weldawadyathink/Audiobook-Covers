import { schemaTask } from "@trigger.dev/sdk/v3";
import { once } from "node:events";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { createGunzip } from "node:zlib";
import { z } from "zod/v4";
import { S3Client } from "@/trigger/s3";

const SOURCE_RANGE_SIZE_BYTES = 64 * 1024 * 1024;
const UPLOAD_PART_SIZE_BYTES = 64 * 1024 * 1024;
const PART_MAX_ATTEMPTS = 3;
const PART_RETRY_BASE_DELAY_MS = 1_000;

export const openLibraryDownloadToS3Task = schemaTask({
  id: "openlibrary-download-to-s3",
  machine: "micro",
  // The dump is ~12GB compressed and is fetched in sequential 64MB ranges, so
  // this comfortably exceeds the 1h default from trigger.config.ts.
  maxDuration: 12 * 60 * 60,
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

    const compressedLength = parseContentLength(
      headResponse.headers.get("content-length"),
      sourceUrl,
    );
    const acceptRanges = headResponse.headers.get("accept-ranges");
    if (acceptRanges !== null && !acceptRanges.includes("bytes")) {
      throw new Error(
        `Source does not advertise byte ranges: ${sourceUrl} (accept-ranges=${acceptRanges})`,
      );
    }

    const resolvedUrl = headResponse.url;
    const compressedPartCount = Math.ceil(
      compressedLength / SOURCE_RANGE_SIZE_BYTES,
    );
    const sourceLooksGzipped =
      sourceUrl.endsWith(".gz") || resolvedUrl.endsWith(".gz");
    if (!sourceLooksGzipped) {
      throw new Error(
        `Source does not look gzipped, refusing to gunzip implicitly: ${resolvedUrl}`,
      );
    }
    if (destinationKey.endsWith(".gz")) {
      console.warn(
        `Destination key ${destinationKey} ends with .gz, but uploaded data will be uncompressed`,
      );
    }

    console.log(
      [
        `Resolved source URL: ${resolvedUrl}`,
        `Compressed size: ${formatBytes(compressedLength)}`,
        `Source range size: ${formatBytes(SOURCE_RANGE_SIZE_BYTES)}`,
        `Source ranges: ${compressedPartCount}`,
        `Upload part size: ${formatBytes(UPLOAD_PART_SIZE_BYTES)}`,
      ].join(" | "),
    );

    const uploadId = await s3.createMultipartUpload(destinationKey, {
      contentType: "application/octet-stream",
    });
    console.log(
      `Created multipart upload ${uploadId} for s3://${s3.bucket}/${destinationKey}`,
    );

    const completedParts: Array<{ ETag: string; PartNumber: number }> = [];
    const compressedInput = new PassThrough();
    const gunzip = createGunzip();
    compressedInput.pipe(gunzip);

    let compressedBytesDownloaded = 0;
    let uncompressedBytesUploaded = 0;
    let uploadPartNumber = 1;

    const gunzipConsumer = consumeGunzipAndUpload({
      completedParts,
      destinationKey,
      gunzip,
      onPartUploaded: ({ bytesUploaded, partNumber }) => {
        uncompressedBytesUploaded += bytesUploaded;
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
        const compressedRate = compressedBytesDownloaded / elapsedSeconds;
        const remainingCompressedBytes =
          compressedLength - compressedBytesDownloaded;
        const etaSeconds =
          compressedRate > 0
            ? Math.ceil(remainingCompressedBytes / compressedRate)
            : null;
        console.log(
          [
            `Completed upload part ${partNumber}`,
            `Source progress: ${formatPercent(compressedBytesDownloaded / compressedLength)} (${formatBytes(compressedBytesDownloaded)}/${formatBytes(compressedLength)})`,
            `Uncompressed uploaded: ${formatBytes(uncompressedBytesUploaded)}`,
            `Compressed throughput: ${formatBytes(compressedRate)}/s`,
            `Elapsed: ${formatDuration(elapsedSeconds)}`,
            `ETA: ${etaSeconds === null ? "unknown" : formatDuration(etaSeconds)}`,
          ].join(" | "),
        );
      },
      s3,
      uploadId,
      uploadPartNumberRef: {
        get value() {
          return uploadPartNumber;
        },
        set value(value: number) {
          uploadPartNumber = value;
        },
      },
    });

    try {
      for (
        let sourceRangeNumber = 1;
        sourceRangeNumber <= compressedPartCount;
        sourceRangeNumber++
      ) {
        const start = (sourceRangeNumber - 1) * SOURCE_RANGE_SIZE_BYTES;
        const end =
          Math.min(start + SOURCE_RANGE_SIZE_BYTES, compressedLength) - 1;
        const expectedLength = end - start + 1;

        console.log(
          `Starting source range ${sourceRangeNumber}/${compressedPartCount} (${formatBytes(expectedLength)}) for bytes=${start}-${end}`,
        );

        const compressedChunk = await fetchCompressedRangeWithRetries({
          compressedLength,
          compressedPartCount,
          end,
          expectedLength,
          resolvedUrl,
          sourceRangeNumber,
          start,
        });

        compressedBytesDownloaded += compressedChunk.length;
        if (!compressedInput.write(compressedChunk)) {
          await once(compressedInput, "drain");
        }
      }

      compressedInput.end();
      await gunzipConsumer;

      const completeResult = await s3.completeMultipartUpload(
        destinationKey,
        uploadId,
        completedParts,
      );

      console.log(
        `Successfully uploaded uncompressed data from ${resolvedUrl} to s3://${s3.bucket}/${destinationKey}`,
      );

      return {
        bucket: s3.bucket,
        compressedLength,
        destinationKey,
        etag: completeResult.ETag ?? null,
        finalUrl: resolvedUrl,
        sourceRangeCount: compressedPartCount,
        uploadPartCount: completedParts.length,
        uncompressedBytesUploaded,
      };
    } catch (error) {
      compressedInput.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
      gunzip.destroy(error instanceof Error ? error : undefined);
      console.error(`Multipart upload failed for ${destinationKey}`, error);
      await s3.abortMultipartUpload(destinationKey, uploadId);
      console.log(
        `Aborted multipart upload ${uploadId} for s3://${s3.bucket}/${destinationKey}`,
      );
      throw error;
    }
  },
});

async function fetchCompressedRangeWithRetries({
  compressedLength,
  compressedPartCount,
  end,
  expectedLength,
  resolvedUrl,
  sourceRangeNumber,
  start,
}: {
  compressedLength: number;
  compressedPartCount: number;
  end: number;
  expectedLength: number;
  resolvedUrl: string;
  sourceRangeNumber: number;
  start: number;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
    let response: Response | undefined;
    try {
      console.log(
        `Source range ${sourceRangeNumber}/${compressedPartCount} attempt ${attempt}/${PART_MAX_ATTEMPTS} | bytes=${start}-${end}`,
      );

      response = await fetch(resolvedUrl, {
        headers: {
          "accept-encoding": "identity",
          range: `bytes=${start}-${end}`,
        },
      });
      if (response.status !== 206) {
        throw new Error(
          `Range request returned ${response.status} ${response.statusText}`,
        );
      }
      if (!response.body) {
        throw new Error(
          `No response body returned for source range ${sourceRangeNumber}`,
        );
      }

      const partContentLength = parseOptionalContentLength(
        response.headers.get("content-length"),
      );
      if (partContentLength !== expectedLength) {
        throw new Error(
          `Source range ${sourceRangeNumber} length mismatch: expected ${expectedLength}, got ${response.headers.get("content-length") ?? "missing"}`,
        );
      }

      const contentRange = response.headers.get("content-range");
      const expectedContentRange = `bytes ${start}-${end}/${compressedLength}`;
      if (contentRange !== expectedContentRange) {
        throw new Error(
          `Source range ${sourceRangeNumber} content-range mismatch: expected "${expectedContentRange}", got "${contentRange}"`,
        );
      }

      const chunks: Buffer[] = [];
      let bytesRead = 0;
      for await (const chunk of Readable.fromWeb(
        response.body as NodeReadableStream,
      )) {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(bufferChunk);
        bytesRead += bufferChunk.length;
      }
      if (bytesRead !== expectedLength) {
        throw new Error(
          `Source range ${sourceRangeNumber} body truncated: expected ${expectedLength}, got ${bytesRead}`,
        );
      }

      return Buffer.concat(chunks, bytesRead);
    } catch (error) {
      lastError = error;
      const summary = formatErrorSummary(error);
      if (attempt >= PART_MAX_ATTEMPTS) {
        console.error(
          `Source range ${sourceRangeNumber}/${compressedPartCount} failed after ${attempt} attempts | ${summary}`,
        );
        throw error;
      }
      const delayMs = PART_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Source range ${sourceRangeNumber}/${compressedPartCount} attempt ${attempt}/${PART_MAX_ATTEMPTS} failed | ${summary} | retrying in ${formatDuration(delayMs / 1000)}`,
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
    : new Error(
        `Source range ${sourceRangeNumber} failed with a non-Error value`,
      );
}

async function consumeGunzipAndUpload({
  completedParts,
  destinationKey,
  gunzip,
  onPartUploaded,
  s3,
  uploadId,
  uploadPartNumberRef,
}: {
  completedParts: Array<{ ETag: string; PartNumber: number }>;
  destinationKey: string;
  gunzip: NodeJS.ReadableStream & AsyncIterable<Buffer | string>;
  onPartUploaded: (args: { bytesUploaded: number; partNumber: number }) => void;
  s3: S3Client;
  uploadId: string;
  uploadPartNumberRef: {
    value: number;
  };
}) {
  const pendingBuffers: Buffer[] = [];
  let pendingBytes = 0;

  for await (const chunk of gunzip) {
    const bufferChunk =
      typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    pendingBuffers.push(bufferChunk);
    pendingBytes += bufferChunk.length;

    while (pendingBytes >= UPLOAD_PART_SIZE_BYTES) {
      const partBuffer = takeBytes(pendingBuffers, UPLOAD_PART_SIZE_BYTES);
      pendingBytes -= partBuffer.length;
      const partNumber = uploadPartNumberRef.value;
      uploadPartNumberRef.value += 1;
      const etag = await s3.uploadPart(
        destinationKey,
        uploadId,
        partNumber,
        partBuffer,
        partBuffer.length,
      );
      completedParts.push({ ETag: etag, PartNumber: partNumber });
      onPartUploaded({ bytesUploaded: partBuffer.length, partNumber });
    }
  }

  if (pendingBytes > 0) {
    const partBuffer = takeBytes(pendingBuffers, pendingBytes);
    const partNumber = uploadPartNumberRef.value;
    uploadPartNumberRef.value += 1;
    const etag = await s3.uploadPart(
      destinationKey,
      uploadId,
      partNumber,
      partBuffer,
      partBuffer.length,
    );
    completedParts.push({ ETag: etag, PartNumber: partNumber });
    onPartUploaded({ bytesUploaded: partBuffer.length, partNumber });
  }
}

function takeBytes(buffers: Buffer[], bytesToTake: number) {
  const taken: Buffer[] = [];
  let remaining = bytesToTake;

  while (remaining > 0) {
    const current = buffers[0];
    if (!current) {
      throw new Error(
        `Requested ${bytesToTake} bytes from buffer queue, but not enough data was available`,
      );
    }

    if (current.length <= remaining) {
      taken.push(current);
      buffers.shift();
      remaining -= current.length;
      continue;
    }

    taken.push(current.subarray(0, remaining));
    buffers[0] = current.subarray(remaining);
    remaining = 0;
  }

  return Buffer.concat(taken, bytesToTake);
}

function parseContentLength(headerValue: string | null, sourceUrl: string) {
  const parsed = parseOptionalContentLength(headerValue);
  if (!parsed || parsed <= 0) {
    throw new Error(`Missing content-length for ${sourceUrl}`);
  }
  return parsed;
}

function parseOptionalContentLength(headerValue: string | null) {
  if (!headerValue) {
    return undefined;
  }
  const parsed = Number.parseInt(headerValue, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid content-length header: ${headerValue}`);
  }
  return parsed;
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
