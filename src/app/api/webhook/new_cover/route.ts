import type { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { blurhashEncode } from "@/server/utils/blurhash";
import { image } from "@/server/db/schema";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { runSingleClip } from "@/server/utils/clip";

export const maxDuration = 60; // Ensure ample time for long replicate responses

interface SupabaseWebhookPayload {
  type: string;
  table: string;
  record: {
    id: string;
    extension: string;
  };
  schema: string;
  old_record: string;
}

async function indexFile(id: string, extension: string) {
  const url = `https://f001.backblazeb2.com/file/com-audiobookcovers/original/${id}.${extension}`;

  // Replicate takes longer to process, and may have cold start. Start replicate
  // before running blurhash algorithm
  const replicatePromise = runSingleClip(url);

  const hash = await blurhashEncode(url);

  const replicateResult = await replicatePromise;

  await db
    .update(image)
    .set({ embedding: replicateResult.embedding, blurhash: hash })
    .where(eq(image.id, id));

  console.log(`Inserted embedding and blurhash for ${id}`);
}

export async function POST(req: NextRequest) {
  const json = (await req.json()) as SupabaseWebhookPayload;
  console.log(["Received webhook for new cover", json]);
  waitUntil(indexFile(json.record.id, json.record.extension));
  return new Response("Success!", {
    status: 200,
  });
}
