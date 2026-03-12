export interface RerankerDocument {
  id: string;
  imageUrl: string;
}

export interface RerankerResult {
  id: string;
  relevanceScore: number;
}

export interface RerankerDefinition {
  // Returns results sorted by relevance score descending
  rerank: (query: string, documents: RerankerDocument[]) => Promise<RerankerResult[]>;
}

import { models as jinaRerankers } from "./jina";
import { RerankerName } from "@/shared/rerankerConstants";

// satisfies ensures every RerankerName has an implementation at compile time.
// Add a reranker here and TypeScript will error until an implementation exists.
export const rerankerMap = {
  ...jinaRerankers,
} satisfies Record<RerankerName, RerankerDefinition>;

export function getReranker(name: string): RerankerDefinition | undefined {
  return (rerankerMap as Record<string, RerankerDefinition>)[name];
}
