import ky from "ky";
import { RerankerDefinition } from "./rerankers";
import { getEnv } from "@/server/env";
import { embedAndSortRelevanceScoreIntoImageData } from "./rerankerHelpers";
import { type ImageData } from "@/server/imageData";

interface JinaRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

async function fetchJinaRerank(
  query: string,
  documents: ImageData[],
  documentUrls: string[],
) {
  const response = await ky
    .post("https://api.jina.ai/v1/rerank", {
      headers: {
        Authorization: `Bearer ${getEnv().JINA_API_KEY}`,
      },
      json: {
        model: "jina-reranker-m0",
        query,
        documents: documentUrls,
      },
      hooks: {
        beforeRetry: [
          async ({ error, retryCount }) => {
            console.error(
              `Jina Reranker API error (retry ${retryCount}):`,
              error.message,
            );
          },
        ],
      },
    })
    .json<JinaRerankResponse>();

  const results = response.results.map((result) => ({
    id: documents[result.index].id,
    relevanceScore: result.relevance_score,
  }));

  return embedAndSortRelevanceScoreIntoImageData(documents, results);
}

export const models = {
  "jina-reranker-m0-webp-1280": {
    rerank: async (query, documents) => {
      const documentUrls = documents.map((doc) => doc.webp[1280]);
      return fetchJinaRerank(query, documents, documentUrls);
    },
  },
  "jina-reranker-m0-jpeg-1280": {
    rerank: async (query, documents) => {
      const documentUrls = documents.map((doc) => doc.jpeg[1280]);
      return fetchJinaRerank(query, documents, documentUrls);
    },
  },
  "jina-reranker-m0-webp-640": {
    rerank: async (query, documents) => {
      const documentUrls = documents.map((doc) => doc.webp[640]);
      return fetchJinaRerank(query, documents, documentUrls);
    },
  },
  "jina-reranker-m0-jpeg-640": {
    rerank: async (query, documents) => {
      const documentUrls = documents.map((doc) => doc.jpeg[640]);
      return fetchJinaRerank(query, documents, documentUrls);
    },
  },
  "jina-reranker-m0-webp-320": {
    rerank: async (query, documents) => {
      const documentUrls = documents.map((doc) => doc.webp[320]);
      return fetchJinaRerank(query, documents, documentUrls);
    },
  },
  "jina-reranker-m0-jpeg-320": {
    rerank: async (query, documents) => {
      const documentUrls = documents.map((doc) => doc.jpeg[320]);
      return fetchJinaRerank(query, documents, documentUrls);
    },
  },
} satisfies Record<string, RerankerDefinition>;
