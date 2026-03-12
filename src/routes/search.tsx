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
import { rerankerNames } from "@/shared/rerankerConstants";

const searchParameters = z.object({
  q: z.string().default(""),
  model: z.string().optional(),
  reranker: z.string().optional(),
  showScore: z.boolean().optional(),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search: { q, model, reranker, showScore } }) => ({ q, model, reranker, showScore }),
  loader: async ({ deps: data }) => {
    const auth = await getIsAuthenticated();
    return {
      q: data.q,
      model: data.model ?? defaultModelName,
      reranker: data.reranker,
      showScore: data.showScore ?? false,
      images: await vectorSearchByString({
        data: { q: data.q, model: data.model, reranker: data.reranker },
      }),
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

function RouteComponent() {
  const { images, isAuthenticated, q, model, reranker, showScore: initialShowScore } = Route.useLoaderData();
  const [searchQuery, setSearchQuery] = useState(q);
  const [selectedModel, setSelectedModel] = useState(model);
  const [selectedReranker, setSelectedReranker] = useState(reranker ?? "");
  const [showAdvanced, setShowAdvanced] = useState(
    model !== defaultModelName || !!reranker,
  );
  const [showScore, setShowScore] = useState(initialShowScore);
  const navigate = useNavigate();
  const submitForm = () => {
    navigate({
      to: "/search",
      search: {
        q: searchQuery,
        model: selectedModel,
        reranker: selectedReranker || undefined,
        showScore: showScore || undefined,
      },
    });
  };
  return (
    <>
      <form
        className="flex flex-col gap-3 mx-36"
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        <div className="flex gap-6">
          <Input
            type="text border rounded-lg px-2 py-1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit">Search</Button>
        </div>
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-gray-700 self-start"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced options" : "Advanced options"}
        </button>
        {showAdvanced && (
          <>
            <div className="flex gap-4">
              <select
                className="border rounded-lg px-2 py-1 text-sm"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {modelNames.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="border rounded-lg px-2 py-1 text-sm"
                value={selectedReranker}
                onChange={(e) => setSelectedReranker(e.target.value)}
              >
                <option value="">No reranker</option>
                {rerankerNames.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showScore}
                onChange={(e) => {
                setShowScore(e.target.checked);
                navigate({
                  to: "/search",
                  search: {
                    q: searchQuery,
                    model: selectedModel,
                    reranker: selectedReranker || undefined,
                    showScore: e.target.checked || undefined,
                  },
                });
              }}
              />
              Show score
            </label>
          </>
        )}
      </form>
      {images.length === 0 && q !== "" && <div>No images found</div>}
      <div className="grid md:grid-cols-4 justify-center gap-6 sm:grid-cols-2 mx-6 my-6">
        {images.map((image) => (
          <ImageCard
            showScore={showScore}
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
