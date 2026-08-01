/**
 * Worker-side plumbing for the manual upload pane.
 *
 * Deliberately contains no `createServerFn` exports — `src/server/upload.ts`
 * holds those, and mixing the two in one file breaks tree shaking.
 *
 * Nothing here may import `src/trigger/**` at runtime. Those modules pull in
 * postgres, the AWS SDK and the WASM image codecs, none of which belong in a
 * Worker bundle; the ingest task is referenced by id and by `import type` only.
 */
import { configure } from "@trigger.dev/sdk/v3";
import { env as cloudflareEnv } from "cloudflare:workers";
import { env } from "@/env.cloudflare";
import { sniffFormat, type ImageFormat } from "@/image/sniff";
import { MAX_IMAGE_BYTES } from "@/image/staging";

/** The task id `ingest-image` registers itself under. */
export const INGEST_TASK_ID = "ingest-image";

/**
 * The R2 bucket holding the whole catalogue.
 *
 * Reached through the binding rather than the S3 API because the Worker cannot
 * use `src/trigger/s3.ts` — it imports `node:stream` and the AWS SDK — and
 * because a binding needs no credentials and no request signing.
 *
 * Typed optional by `wrangler types`: the generated base `Env` unions the two
 * deployment environments, so every per-environment binding arrives as possibly
 * undefined and has to be checked once, here.
 */
export function imagesBucket(): R2Bucket {
  const bucket = cloudflareEnv.IMAGES_BUCKET;
  if (!bucket) {
    throw new Error(
      "No IMAGES_BUCKET binding. Check the r2_buckets entry in wrangler.jsonc.",
    );
  }
  return bucket;
}

/**
 * Point the SDK at this stage's Trigger.dev project.
 *
 * Called before every trigger and every token mint rather than once at module
 * scope: reading `env.TRIGGER_SECRET_KEY` throws when it is missing (see
 * `src/env.ts`), and a throw at module scope would take down every route in the
 * bundle instead of just the upload pane.
 */
export function configureTrigger() {
  configure({ secretKey: env.TRIGGER_SECRET_KEY });
}

export interface StagedFile {
  bytes: ArrayBuffer;
  format: ImageFormat;
  /** The name the browser sent, for error messages only. */
  filename: string;
}

/**
 * Pull one image out of a multipart submission and check it is really an image.
 *
 * The declared content type is ignored. Browsers derive `File.type` from the
 * filename on most platforms, and this catalogue is full of proof that filenames
 * lie about formats — so the magic bytes decide, and the extension the object is
 * eventually stored under comes from what the bytes turned out to be.
 */
export async function readImageUpload(form: FormData): Promise<StagedFile> {
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new Error("No file in the upload");
  }
  if (file.size === 0) {
    throw new Error(`${file.name} is empty`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `${file.name} is ${Math.round(file.size / 1024 / 1024)}MB, over the ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB limit`,
    );
  }

  const bytes = await file.arrayBuffer();
  const format = sniffFormat(new Uint8Array(bytes));
  if (!format) {
    throw new Error(
      `${file.name} is not a PNG, JPEG or WebP — the pipeline cannot decode anything else`,
    );
  }

  return { bytes, format, filename: file.name };
}
