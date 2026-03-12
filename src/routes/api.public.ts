import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          name: "Audiobook Covers Public API",
          version: 1,
          endpoints: {
            random: "/api/public/random",
            search: "/api/public/search?q=<query>",
            image: "/api/public/images/<image-id>",
          },
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
