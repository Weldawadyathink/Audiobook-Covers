import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import { vectorSearchByString } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";

const searchParameters = z.object({
  q: z.string().default(""),
  model: z.string().default("mobileclip_s0"),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search: { q, model } }) => ({ q, model }),
  loader: async ({ deps: data }) => {
    return {
      images: await vectorSearchByString({ data }),
      auth: true,
    };
  },
});

function RouteComponent() {
  const { images, auth } = Route.useLoaderData();
  return (
    <>
      <div>Hello "/search/"!</div>
      <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {images.map((image) => (
          <ImageCard
            showDistance={auth}
            showDataset={auth}
            key={image.id}
            imageData={image}
            className="max-w-96"
          />
        ))}
      </div>
      <Outlet />
    </>
  );
}
