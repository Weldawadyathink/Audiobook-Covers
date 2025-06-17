import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import { vectorSearchByString } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
      q: data.q,
      model: data.model,
      images: await vectorSearchByString({ data }),
      auth: true,
    };
  },
});

function RouteComponent() {
  const { images, auth, q, model } = Route.useLoaderData();
  const [searchQuery, setSearchQuery] = useState(q);
  const navigate = useNavigate();
  const submitForm = () => {
    navigate({
      to: "/search",
      search: {
        q: searchQuery,
        model: model,
      },
    });
  };
  return (
    <>
      <form
        className="flex gap-6 mx-36"
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Button type="submit">Search</Button>
      </form>
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
