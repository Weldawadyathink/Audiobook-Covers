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

type RRFSlot = { model: string; k: number; weight: number } | null;

const DEFAULT_RRF_SLOTS: RRFSlot[] = [
  { model: defaultModelName, k: 60, weight: 1 },
  { model: "voyage-multimodal-3.5", k: 60, weight: 1 },
  null,
  null,
  null,
  null,
];

function parseRrfConfig(rrfConfig: string | undefined): RRFSlot[] {
  if (!rrfConfig) return DEFAULT_RRF_SLOTS;
  try {
    const parsed = JSON.parse(rrfConfig) as RRFSlot[];
    const slots: RRFSlot[] = [...DEFAULT_RRF_SLOTS];
    parsed.forEach((slot, i) => {
      if (i < 6) slots[i] = slot;
    });
    return slots;
  } catch {
    return DEFAULT_RRF_SLOTS;
  }
}

const searchParameters = z.object({
  q: z.string().default(""),
  model: z.string().optional(),
  reranker: z.string().optional(),
  showScore: z.boolean().optional(),
  rrfConfig: z.string().optional(),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search: { q, model, reranker, showScore, rrfConfig } }) => ({ q, model, reranker, showScore, rrfConfig }),
  loader: async ({ deps: data }) => {
    const auth = await getIsAuthenticated();
    let searchModel: string | { model: string; k: number; weight: number }[] | undefined = data.model;
    if (data.model === "rrf" && data.rrfConfig) {
      try {
        const parsed = JSON.parse(data.rrfConfig) as { model: string; k: number; weight: number }[];
        if (parsed.length > 0) searchModel = parsed;
        else searchModel = undefined;
      } catch {
        searchModel = undefined;
      }
    } else if (data.model === "rrf") {
      searchModel = undefined;
    }
    return {
      q: data.q,
      model: data.model ?? defaultModelName,
      reranker: data.reranker,
      showScore: data.showScore ?? false,
      rrfConfig: data.rrfConfig,
      images: await vectorSearchByString({
        data: { q: data.q, model: searchModel },
      }),
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

function RouteComponent() {
  const { images, isAuthenticated, q, model, reranker, showScore: initialShowScore, rrfConfig } = Route.useLoaderData();
  const [searchQuery, setSearchQuery] = useState(q);
  const [selectedModel, setSelectedModel] = useState<string>(model);
  const [selectedReranker, setSelectedReranker] = useState(reranker ?? "");
  const [showAdvanced, setShowAdvanced] = useState(
    model !== defaultModelName || !!reranker,
  );
  const [showScore, setShowScore] = useState(initialShowScore);
  const [rrfSlots, setRrfSlots] = useState<RRFSlot[]>(() => parseRrfConfig(rrfConfig));
  const navigate = useNavigate();

  const buildSearch = (overrides?: { showScore?: boolean }) => ({
    q: searchQuery,
    model: selectedModel,
    reranker: selectedReranker || undefined,
    showScore: (overrides?.showScore ?? showScore) || undefined,
    rrfConfig:
      selectedModel === "rrf"
        ? JSON.stringify(rrfSlots.filter(Boolean))
        : undefined,
  });

  const submitForm = () => {
    navigate({ to: "/search", search: buildSearch() });
  };

  const updateSlot = (index: number, updates: Partial<NonNullable<RRFSlot>>) => {
    setRrfSlots((prev) => {
      const next = [...prev];
      const current = next[index] ?? { model: "", k: 60, weight: 1 };
      next[index] = { ...current, ...updates };
      return next;
    });
  };

  const clearSlot = (index: number) => {
    setRrfSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const setSlotModel = (index: number, model: string) => {
    if (!model) {
      clearSlot(index);
    } else {
      setRrfSlots((prev) => {
        const next = [...prev];
        const current = next[index] ?? { model: "", k: 60, weight: 1 };
        next[index] = { ...current, model };
        return next;
      });
    }
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
                <optgroup label="Multi-model">
                  <option value="rrf">RRF (multi-model)</option>
                </optgroup>
                <optgroup label="Single model">
                  {modelNames.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
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
            {selectedModel === "rrf" && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="grid text-xs text-gray-500 font-medium" style={{ gridTemplateColumns: "1fr 80px 70px 60px" }}>
                  <span>Model</span>
                  <span>Weight</span>
                  <span>K</span>
                  <span></span>
                </div>
                {rrfSlots.map((slot, i) => (
                  <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 80px 70px 60px" }}>
                    <select
                      className="border rounded-lg px-2 py-1 text-sm"
                      value={slot?.model ?? ""}
                      onChange={(e) => setSlotModel(i, e.target.value)}
                    >
                      <option value="">— none —</option>
                      {modelNames.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="border rounded-lg px-2 py-1 text-sm w-full"
                      value={slot?.weight ?? 1}
                      min={0}
                      step={0.1}
                      disabled={!slot}
                      onChange={(e) => updateSlot(i, { weight: parseFloat(e.target.value) || 1 })}
                    />
                    <input
                      type="number"
                      className="border rounded-lg px-2 py-1 text-sm w-full"
                      value={slot?.k ?? 60}
                      min={1}
                      step={1}
                      disabled={!slot}
                      onChange={(e) => updateSlot(i, { k: parseInt(e.target.value) || 60 })}
                    />
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      disabled={!slot}
                      onClick={() => clearSlot(i)}
                    >
                      Clear
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showScore}
                onChange={(e) => {
                  setShowScore(e.target.checked);
                  navigate({
                    to: "/search",
                    search: buildSearch({ showScore: e.target.checked }),
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
