import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import { vectorSearchByString } from "@/server/imageSearcher";
import ImageCard from "@/components/ImageCard";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getIsAuthenticated } from "@/server/auth";
import { modelNames, defaultModelName } from "@/shared/modelConstants";

const searchParameters = z.object({
  q: z.string().default(""),
  model: z.string().optional(),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search: { q, model } }) => ({ q, model }),
  loader: async ({ deps: data }) => {
    const auth = await getIsAuthenticated();
    return {
      q: data.q,
      model: data.model ?? defaultModelName,
      availableModels: modelNames,
      images: await vectorSearchByString({ data: { q: data.q, model: data.model } }),
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

function RouteComponent() {
  const { images, isAuthenticated, q, model, availableModels } = Route.useLoaderData();
  const [searchQuery, setSearchQuery] = useState(q);
  const navigate = useNavigate();
  const submitForm = (overrides?: { model?: string }) => {
    navigate({
      to: "/search",
      search: {
        q: searchQuery,
        model: overrides?.model ?? model,
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
          type="text border rounded-lg px-2 py-1"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="border rounded-lg px-2 py-1 text-sm"
          value={model}
          onChange={(e) => submitForm({ model: e.target.value })}
        >
          {availableModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
