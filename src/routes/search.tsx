import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import { vectorSearchByString } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getIsAuthenticated } from "@/server/auth";

const searchParameters = z.object({
  q: z.string().default(""),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search: { q } }) => ({ q }),
  loader: async ({ deps: data }) => {
    const auth = await getIsAuthenticated();
    return {
      q: data.q,
      images: await vectorSearchByString({ data }),
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

function RouteComponent() {
  const { images, isAuthenticated, q } = Route.useLoaderData();
  const [searchQuery, setSearchQuery] = useState(q);
  const navigate = useNavigate();
  const submitForm = () => {
    navigate({
      to: "/search",
      search: {
        q: searchQuery,
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
      {images.length === 0 && q !== "" && <div>No images found</div>}
      <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {images.map((image) => (
          <ImageCard
            showDistance={isAuthenticated}
            showDataset={isAuthenticated}
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
