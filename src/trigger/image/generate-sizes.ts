/**
 * Generate the JPEG and WebP derivatives the website serves.
 *
 * One image in, eight objects out: 320, 640, 1280 and the original resolution,
 * in each of the two formats. The keys are the ones `shapeImageData` already
 * builds URLs for — `<format>/<size>/<id>.<ext>`, alongside the untouched
 * `original/<id>.<extension>` this task reads from — so a run of this task is
 * what turns a row in `image` into a cover the site can actually display.
 *
 * Nothing here trusts `image.extension` for anything except building the source
 * key. A meaningful share of the catalogue is WebP bytes stored under a `.jpg`
 * extension, because the Reddit ingest named files after the URL it fetched
 * them from and i.redd.it serves WebP from `.jpg` paths. The decoder sniffs
 * magic bytes instead; see `src/image/codec.ts`.
 */
import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createWriteDb } from "@/db.node";
import * as schema from "@/db/schema";
import { S3Client } from "@/trigger/s3";
import {
  decodeToRgba,
  encodeJpeg,
  encodeWebp,
  resizeRgba,
} from "@/image/codec";

/**
 * The widths the site asks for, plus the original resolution.
 *
 * `original` is a key segment rather than a number because it has no fixed
 * width — it is whatever the source happened to be, re-encoded. It uses the
 * same word as the `original/` prefix that holds the untransformed upload.
 */
const SIZES = [320, 640, 1280, "original"] as const;

const JPEG_QUALITY = 82;
const WEBP_QUALITY = 80;

/**
 * Derivatives are immutable for the life of an image id, and a regenerate
 * writes to the same key, so a long TTL is safe. A changed encoder means a
 * purge, not a shorter TTL on every request for the next decade.
 */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

interface Derivative {
  key: string;
  contentType: string;
  body: Buffer;
  width: number;
  height: number;
}

export const generateImageSizesTask = schemaTask({
  id: "generate-image-sizes",
  schema: z.object({
    id: z.string().uuid(),
    /** Re-encode even if this image already has derivatives. */
    force: z.boolean().default(false),
  }),
  // Pure-JS encoding holds the full-resolution RGBA bitmap plus a target buffer
  // in memory at once: ~36MB for a 3000px square, before the encoders' own
  // scratch space. The smaller presets run out on the largest covers.
  machine: "small-2x",
  maxDuration: 600,
  run: async ({ id, force }) => {
    const db = createWriteDb();

    const image = await db.query.image.findFirst({
      columns: {
        id: true,
        extension: true,
        deleted: true,
        derivatives_generated_at: true,
      },
      where: (image, { eq }) => eq(image.id, id),
    });

    if (!image) {
      throw new Error(`No image found with id: ${id}`);
    }
    if (!image.extension) {
      throw new Error(`Image ${id} has no extension, so it has no source key`);
    }
    if (image.deleted) {
      // Not an error: the delete may well have happened after this run was
      // enqueued, and failing would only add noise to the dashboard.
      console.log(`Image ${id} is deleted, skipping`);
      return { id, skipped: "deleted" as const };
    }
    if (image.derivatives_generated_at && !force) {
      console.log(
        `Image ${id} already has derivatives from ${image.derivatives_generated_at.toISOString()}, skipping`,
      );
      return { id, skipped: "already-generated" as const };
    }

    const s3 = new S3Client("default");
    const sourceKey = `original/${id}.${image.extension}`;

    const object = await s3.safeGetObject(sourceKey);
    if (!object) {
      throw new Error(`No original in S3 at ${sourceKey}`);
    }
    const source = Buffer.from(await object.transformToByteArray());

    const decoded = await decodeToRgba(source);
    console.log(
      `Decoded ${sourceKey} as ${decoded.format} at ${decoded.width}x${decoded.height} (${source.byteLength} bytes)`,
    );

    const derivatives: Derivative[] = [];

    for (const size of SIZES) {
      // Never upscale. The 1280 key still gets written for a 500px original —
      // the site builds these URLs unconditionally, so a missing object is a
      // broken image — but it holds 500px rather than a blurred 1280.
      const targetWidth =
        size === "original" ? decoded.width : Math.min(size, decoded.width);
      // Covers are square in practice, but deriving the height costs one line
      // and keeps a stray non-square original from coming out stretched.
      const targetHeight =
        targetWidth === decoded.width
          ? decoded.height
          : Math.max(
              1,
              Math.round((decoded.height * targetWidth) / decoded.width),
            );

      const resized = resizeRgba(decoded, targetWidth, targetHeight);

      derivatives.push({
        key: `jpeg/${size}/${id}.jpg`,
        contentType: "image/jpeg",
        body: encodeJpeg(resized, JPEG_QUALITY),
        width: targetWidth,
        height: targetHeight,
      });
      derivatives.push({
        key: `webp/${size}/${id}.webp`,
        contentType: "image/webp",
        body: await encodeWebp(resized, WEBP_QUALITY),
        width: targetWidth,
        height: targetHeight,
      });
    }

    for (const derivative of derivatives) {
      await s3.createObject(
        derivative.key,
        derivative.body,
        derivative.contentType,
        {
          cacheControl: CACHE_CONTROL,
        },
      );
      console.log(
        `Wrote ${derivative.key} at ${derivative.width}x${derivative.height} (${derivative.body.byteLength} bytes)`,
      );
    }

    // Written only after every object has landed, so a run that dies halfway
    // through the uploads is picked up again by the next "derivatives IS NULL"
    // sweep rather than being recorded as done.
    await db
      .update(schema.image)
      .set({ derivatives_generated_at: new Date() })
      .where(eq(schema.image.id, id));

    return {
      id,
      sourceFormat: decoded.format,
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      written: derivatives.map((derivative) => derivative.key),
    };
  },
});
