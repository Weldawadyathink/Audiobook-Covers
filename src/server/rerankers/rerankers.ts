import { type ImageData } from "../imageData";

export interface RerankerDefinition {
  // Gets a reranking of the ImageData by query
  // Overrides the score field on each ImageData with the relevance score
  // Sorts the ImageData by relevance score descending
  rerank: (
    query: string,
    documents: ImageData[],
    env?: Cloudflare.Env,
  ) => Promise<ImageData[]>;
}

import { models as jinaRerankers } from "./jina";

export const rerankerMap: Record<string, RerankerDefinition> = {
  ...jinaRerankers,
};

export function getReranker(
  name: string | undefined,
): RerankerDefinition | undefined {
  if (!name) return undefined;
  return rerankerMap[name];
}
