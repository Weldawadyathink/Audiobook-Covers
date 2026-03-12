import ky from "ky";
import { ModelDefinition, EmbeddingOutput } from "./models";
import { ModelName } from "@/shared/modelConstants";
import { getEnv } from "@/server/env";

interface JinaEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

async function embed(
  modelId: "jina-clip-v1" | "jina-clip-v2",
  input: Array<{ text: string } | { image: string }>,
  inputType: "retrieval.query" | "retrieval.passage",
  outputDimension?: number,
): Promise<number[]> {
  const response = await ky
    .post("https://api.jina.ai/v1/embeddings", {
      headers: {
        Authorization: `Bearer ${getEnv().JINA_API_KEY}`,
      },
      json: {
        model: modelId,
        input,
        input_type: inputType,
        ...(outputDimension !== undefined && { dimensions: outputDimension }),
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
            console.error(`Jina API error (retry ${retryCount}):`, error.message);
          },
        ],
      },
    })
    .json<JinaEmbeddingResponse>();
  return response.data[0].embedding;
}

async function getTextEmbedding(
  modelId: "jina-clip-v1" | "jina-clip-v2",
  input: string,
  outputDimension?: number,
): Promise<EmbeddingOutput> {
  const embedding = await embed(modelId, [{ text: input }], "retrieval.query", outputDimension);
  return { input, embedding };
}

async function getImageEmbedding(
  modelId: "jina-clip-v1" | "jina-clip-v2",
  input: string,
  outputDimension?: number,
): Promise<EmbeddingOutput> {
  const embedding = await embed(modelId, [{ image: input }], "retrieval.passage", outputDimension);
  return { input, embedding };
}

export const models = {
  "jina-clip-v1": {
    dimensions: 768,
    dbColumn: "embedding_jina_clip_v1",
    getTextEmbedding: (input) => getTextEmbedding("jina-clip-v1", input),
    getImageEmbedding: (input) => getImageEmbedding("jina-clip-v1", input),
  },
  "jina-clip-v2": {
    dimensions: 1024,
    dbColumn: "embedding_jina_clip_v2",
    getTextEmbedding: (input) => getTextEmbedding("jina-clip-v2", input),
    getImageEmbedding: (input) => getImageEmbedding("jina-clip-v2", input),
  },
  "jina-clip-v2-d32": {
    // clip v2 model reduced to 32 dimensions
    // Testing if I can use a low dimensionality model for poor quality retrieval
    // with lower database impact and use a reranker to get good quality rankings
    dimensions: 32,
    dbColumn: "embedding_jina_clip_v2_d32",
    getTextEmbedding: (input) => getTextEmbedding("jina-clip-v2", input, 32),
    getImageEmbedding: (input) => getImageEmbedding("jina-clip-v2", input, 32),
  },
} satisfies Partial<Record<ModelName, ModelDefinition>>;
