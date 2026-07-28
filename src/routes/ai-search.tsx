import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";

/**
 * Visual search now lives at `/search?mode=visual`. This route stays behind as a
 * permanent redirect so existing links and bookmarks keep working.
 */
const legacyParameters = z.object({
  q: z.string().optional(),
  model: z.string().optional(),
  reranker: z.string().optional(),
  showScore: z.boolean().optional(),
});

export const Route = createFileRoute("/ai-search")({
  validateSearch: zodValidator(legacyParameters),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/search",
      search: {
        mode: "visual" as const,
        q: search.q || undefined,
        reranker: search.reranker,
        showScore: search.showScore,
      },
      replace: true,
    });
  },
});
