import ky from "ky";
import { RerankerDefinition, RerankerDocument, RerankerResult } from "./rerankers";
import { RerankerName } from "@/shared/rerankerConstants";
import { getEnv } from "@/server/env";

interface JinaRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

export const models = {
  "jina-reranker-m0": {
    rerank: async (query: string, documents: RerankerDocument[]): Promise<RerankerResult[]> => {
      const response = await ky
        .post("https://api.jina.ai/v1/rerank", {
          headers: {
            Authorization: `Bearer ${getEnv().JINA_API_KEY}`,
          },
          json: {
            model: "jina-reranker-m0",
            query,
            documents: documents.map((doc) => ({ image: doc.imageUrl })),
          },
          retry: {
            limit: 5,
            methods: ["post"],
            statusCodes: [429, 500, 502, 503, 504],
            afterStatusCodes: [429, 503],
            delay: (attemptCount) => 60_000 * attemptCount,
          },
          hooks: {
            beforeRetry: [
              async ({ error, retryCount }) => {
                console.error(`Jina Reranker API error (retry ${retryCount}):`, error.message);
              },
            ],
          },
        })
        .json<JinaRerankResponse>();

      return response.results
        .map((result) => ({
          id: documents[result.index].id,
          relevanceScore: result.relevance_score,
        }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
    },
  },
} satisfies Partial<Record<RerankerName, RerankerDefinition>>;
