/**
 * Generate the JPEG, WebP and PNG derivatives the website serves.
 *
 * One image in, nine objects out: 320, 640, 1280 and the original resolution as
 * both JPEG and WebP, plus a lossless PNG at the original resolution. The keys
 * are the ones `shapeImageData` already builds URLs for —
 * `<format>/<size>/<id>.<ext>`, alongside the untouched
 * `original/<id>.<extension>` this task reads from — so a run of this task is
 * what turns a row in `image` into a cover the site can actually display.
 *
 * PNG is deliberately only produced at the original resolution. It is the
 * lossless copy, several times heavier than the JPEG or WebP of the same
 * picture; at 320px it would be both larger than the WebP and pointless, since
 * nothing downscaled is lossless in any useful sense.
 *
 * It also writes back the facts that only a decode can establish: the
 * original's true format, its pixel dimensions and byte size, and its blurhash.
 * Those are free here — the bitmap is already in memory — and have nowhere else
 * to come from.
 *
 * Nothing here trusts `image.extension` for anything except building the source
 * key. A meaningful share of the catalogue is WebP bytes stored under a `.jpg`
 * extension, because the Reddit ingest named files after the URL it fetched
 * them from and i.redd.it serves WebP from `.jpg` paths. The decoder sniffs
 * magic bytes instead; see `src/image/codec.ts`.
 */
import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { createWriteDb } from "@/db.node";
import * as schema from "@/db/schema";
import { S3Client } from "@/trigger/s3";
import { blurhashEncode } from "@/image/blurhash";
import { imageIdSchema } from "@/ids";
import {
  decodeToRgba,
  encodeJpeg,
  encodePng,
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
 * One week.
 *
 * A regenerate writes to the same key, so the bytes behind a URL can change
 * without the URL doing so — and a cache holding the old copy has no way to
 * find out. A year of `immutable` made that permanent short of a CDN purge; a
 * week means a re-encode reaches everyone on its own, and the cost of being
 * wrong is bounded by how long you are willing to wait rather than by
 * remembering to purge.
 *
 * Cheap because the origin is R2: egress to Cloudflare's cache is free, so a
 * miss costs a little latency and nothing else. That is the trade being made
 * here — slightly more origin traffic in exchange for not having to keep a
 * purge step in your head every time the encoder settings move.
 *
 * `immutable` is deliberately gone rather than merely shortened. It tells the
 * browser not to revalidate even on an explicit reload, which is precisely the
 * escape hatch a shorter TTL exists to preserve.
 */
const CACHE_CONTROL = "public, max-age=604800";

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
    id: imageIdSchema,
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

    // Cheap next to the encoders, and this is the only place in the codebase
    // holding a decoded original — `image.blurhash` is read in half a dozen
    // places and, until now, written in none.
    const blurhash = blurhashEncode(decoded);

    const derivatives: Derivative[] = [];
    // Once an original is 1280px or smaller — most of the catalogue — the
    // `1280` and `original` keys describe the same pixels, and clamping means
    // a 600px original collapses `640` into them too. Encoding per distinct
    // width rather than per key stops the same JPEG being computed three times;
    // both keys are still written, since the site asks for both by name.
    const encoded = new Map<number, { jpeg: Buffer; webp: Buffer }>();

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

      let bodies = encoded.get(targetWidth);
      if (!bodies) {
        const resized = resizeRgba(decoded, targetWidth, targetHeight);
        bodies = {
          jpeg: encodeJpeg(resized, JPEG_QUALITY),
          webp: await encodeWebp(resized, WEBP_QUALITY),
        };
        encoded.set(targetWidth, bodies);
      }

      derivatives.push({
        key: `jpeg/${size}/${id}.jpg`,
        contentType: "image/jpeg",
        body: bodies.jpeg,
        width: targetWidth,
        height: targetHeight,
      });
      derivatives.push({
        key: `webp/${size}/${id}.webp`,
        contentType: "image/webp",
        body: bodies.webp,
        width: targetWidth,
        height: targetHeight,
      });
    }

    // The lossless copy, at full resolution and in exactly one format, so it
    // sits outside the size loop rather than inside a branch of it. `decoded`
    // is already the full-resolution bitmap, so there is nothing to resize.
    derivatives.push({
      key: `png/original/${id}.png`,
      contentType: "image/png",
      body: await encodePng(decoded),
      width: decoded.width,
      height: decoded.height,
    });

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
    //
    // `width`/`height`/`bytes`/`original_format` describe the *original*, not
    // any derivative, and are set unconditionally rather than only when null:
    // this task has just decoded the file itself, which makes it a better
    // authority than whatever wrote the row. `original_format` in particular is
    // the only thing in the schema that can answer what a file actually is —
    // `extension` is a key fragment and lies about the WebP-inside-`.jpg` rows.
    await db
      .update(schema.image)
      .set({
        width: decoded.width,
        height: decoded.height,
        bytes: source.byteLength,
        original_format: decoded.format,
        blurhash,
        derivatives_generated_at: new Date(),
      })
      .where(eq(schema.image.id, id));

    return {
      id,
      sourceFormat: decoded.format,
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      blurhash,
      written: derivatives.map((derivative) => derivative.key),
    };
  },
});
