import { getRandom } from "@/server/imageSearcher";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/random")({
  server: {
    handlers: {
      GET: async () => {
        const images = await getRandom();
        return Response.json({
          images,
          total: images.length,
        });
      },
    },
  },
});
