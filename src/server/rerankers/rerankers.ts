import { type ImageData } from "../imageData";

export interface RerankerDefinition {
  // Gets a reranking of the ImageData by query
  // Overrides the score field on each ImageData with the relevance score
  // Sorts the ImageData by relevance score descending
  rerank: (query: string, documents: ImageData[]) => Promise<ImageData[]>;
}

import { models as jinaRerankers } from "./jina";
import { RerankerName } from "@/shared/rerankerConstants";

// satisfies ensures every RerankerName has an implementation at compile time.
// Add a reranker here and TypeScript will error until an implementation exists.
export const rerankerMap = {
  ...jinaRerankers,
} satisfies Record<RerankerName, RerankerDefinition>;

export function getReranker(
  name: string | RerankerName | undefined,
): RerankerDefinition | undefined {
  if (!name) return undefined;
  return (rerankerMap as Record<string | RerankerName, RerankerDefinition>)[
    name
  ];
}
