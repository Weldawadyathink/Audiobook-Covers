export const rerankerNames = [
  "jina-reranker-m0-webp-1280",
  "jina-reranker-m0-jpeg-1280",
  "jina-reranker-m0-webp-640",
  "jina-reranker-m0-jpeg-640",
  "jina-reranker-m0-webp-320",
  "jina-reranker-m0-jpeg-320",
] as const;
export type RerankerName = (typeof rerankerNames)[number];
