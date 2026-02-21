import { vectorSearchByString } from "@/server/imageSearcher";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (q === null) {
          return Response.json(
            { error: 'Missing required query parameter "q".' },
            { status: 400 },
          );
        }

        const images = await vectorSearchByString({ data: { q } });
        return Response.json({
          query: q,
          images,
          total: images.length,
          similarity: {
            metric: "cosine_distance",
            field: "distance",
            order: "ascending (smaller is more similar)",
          },
        });
      },
    },
  },
});
