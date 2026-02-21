import { getImageByIdAndSimilar } from "@/server/imageSearcher";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4";

export const Route = createFileRoute("/api/public/images/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsedId = z.uuid().safeParse(params.id);
        if (!parsedId.success) {
          return Response.json(
            { error: 'Invalid image id. Expected UUID in path parameter "id".' },
            { status: 400 },
          );
        }

        const images = await getImageByIdAndSimilar({ data: parsedId.data });
        if (images.length === 0) {
          return Response.json({ error: "Image not found." }, { status: 404 });
        }

        const [image, ...similar] = images;
        return Response.json({
          image,
          similar,
          totalSimilar: similar.length,
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
