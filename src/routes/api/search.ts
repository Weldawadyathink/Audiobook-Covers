import { z } from "zod/v4";
import { createFileRoute } from "@tanstack/react-router";
import { vectorSearchByString } from "@/server/imageSearcherAI";
import { defaultModelName } from "@/searchModels/models";
import type { ImageData } from "@/server/imageData";

const searchSchema = z.object({
  q: z.string().min(1),
  model: z.string().optional(),
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
): Promise<ImageData[]> {
  const { q, limit } = params;

  const images = await vectorSearchByString({ data: { q } });

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
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;

        const parsed = searchSchema.safeParse({
          q: sp.get("q") ?? undefined,
          model: sp.get("model") ?? undefined,
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
