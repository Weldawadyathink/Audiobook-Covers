import { z } from "zod/v4";
import { createFileRoute } from "@tanstack/react-router";
import { vectorSearchByString } from "@/server/imageSearcherAI";
import { getReranker } from "@/server/rerankers/rerankers";
import { defaultModelName } from "@/server/search/search";
import type { ImageData } from "@/server/imageData";

const searchSchema = z.object({
  q: z.string().min(1),
  model: z.string().optional(),
  reranker: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mapImage(image: ImageData) {
  return {
    id: image.id,
    url: image.url,
    source: image.source,
    score: image.score,
    blurhash_url: image.blurhashUrl,
    images: {
      jpeg: image.jpeg,
      webp: image.webp,
    },
    primary_color: image.primaryColor,
  };
}

async function runSearch(
  params: z.infer<typeof searchSchema>,
  env?: Cloudflare.Env,
): Promise<ImageData[]> {
  const { q, reranker, limit } = params;

  let images = await vectorSearchByString({ data: { q } });

  if (reranker) {
    const rerankerInstance = getReranker(reranker);
    if (rerankerInstance) {
      images = await rerankerInstance.rerank(q, images, env);
    }
  }

  return images.slice(0, limit);
}

function buildResponse(
  images: ImageData[],
  params: z.infer<typeof searchSchema>,
): Response {
  return new Response(
    JSON.stringify({
      results: images.map(mapImage),
      count: images.length,
      query: params.q,
      model: defaultModelName,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const sp = new URL(request.url).searchParams;

        const parsed = searchSchema.safeParse({
          q: sp.get("q") ?? undefined,
          model: sp.get("model") ?? undefined,
          reranker: sp.get("reranker") ?? undefined,
          limit: sp.has("limit") ? sp.get("limit") : undefined,
        });

        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join("; ");
          return jsonError(message, 400);
        }

        try {
          const images = await runSearch(parsed.data, context!.cloudflare.env);
          return buildResponse(images, parsed.data);
        } catch (err) {
          console.error("Search error:", err);
          return jsonError("Search failed", 500);
        }
      },

      POST: async ({ request, context }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid JSON body", 400);
        }

        const parsed = searchSchema.safeParse(body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join("; ");
          return jsonError(message, 400);
        }

        try {
          const images = await runSearch(parsed.data, context!.cloudflare.env);
          return buildResponse(images, parsed.data);
        } catch (err) {
          console.error("Search error:", err);
          return jsonError("Search failed", 500);
        }
      },
    },
  },
});
