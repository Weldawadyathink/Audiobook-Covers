import { z } from "zod/v4";
import { createFileRoute } from "@tanstack/react-router";
import { vectorSearchByString } from "@/server/imageSearcherAI";
import { getReranker } from "@/server/rerankers/rerankers";
import { defaultModelName } from "@/server/search/search";
import type { ImageData } from "@/server/imageData";

const rrfSlotSchema = z.object({
  model: z.string(),
  k: z.coerce.number().default(60),
  weight: z.coerce.number().default(1),
});

const searchSchema = z.object({
  q: z.string().min(1),
  model: z.string().optional(),
  reranker: z.string().optional(),
  rrf_config: z.array(rrfSlotSchema).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const DEFAULT_RRF = [
  { model: "voyage-multimodal-3", k: 60, weight: 1 },
  { model: "voyage-multimodal-3.5", k: 60, weight: 1 },
];

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
): Promise<ImageData[]> {
  const { q, model, rrf_config, reranker, limit } = params;

  const modelArg = model === "rrf" ? (rrf_config ?? DEFAULT_RRF) : model;

  let images = await vectorSearchByString({ data: { q, model: modelArg } });

  if (reranker) {
    const rerankerInstance = getReranker(reranker);
    if (rerankerInstance) {
      images = await rerankerInstance.rerank(q, images);
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
      model: params.model ?? defaultModelName,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;

        let rrf_config: unknown = undefined;
        const rrfRaw = sp.get("rrf_config");
        if (rrfRaw) {
          try {
            rrf_config = JSON.parse(rrfRaw);
          } catch {
            return jsonError("Invalid rrf_config: must be valid JSON", 400);
          }
        }

        const parsed = searchSchema.safeParse({
          q: sp.get("q") ?? undefined,
          model: sp.get("model") ?? undefined,
          reranker: sp.get("reranker") ?? undefined,
          rrf_config,
          limit: sp.has("limit") ? sp.get("limit") : undefined,
        });

        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join("; ");
          return jsonError(message, 400);
        }

        try {
          const images = await runSearch(parsed.data);
          return buildResponse(images, parsed.data);
        } catch (err) {
          console.error("Search error:", err);
          return jsonError("Search failed", 500);
        }
      },

      POST: async ({ request }) => {
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
          const images = await runSearch(parsed.data);
          return buildResponse(images, parsed.data);
        } catch (err) {
          console.error("Search error:", err);
          return jsonError("Search failed", 500);
        }
      },
    },
  },
});
