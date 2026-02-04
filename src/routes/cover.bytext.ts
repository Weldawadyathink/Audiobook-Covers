import { vectorSearchByString } from "@/server/imageSearcher";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cover/bytext")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (!q) {
          return new Response("No query provided", { status: 400 });
        }
        const images = await vectorSearchByString({ data: { q } });

        // I originally used a weird json format for the response,
        // so this stays for backwards compatibility with audiobookshelf.
        const weirdFormat = images.map((image) => ({
          versions: {
            png: {
              original: image.url,
            },
          },
        }));
        return new Response(JSON.stringify(weirdFormat), { status: 200 });
      },
    },
  },
});
