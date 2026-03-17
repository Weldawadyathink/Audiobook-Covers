import ky from "ky";
import { z } from "zod";
import { ModelDefinition, EmbeddingOutput } from "./search";
import { getEnv } from "@/server/env";

const JinaEmbeddingResponse = z.object({
  model: z.string(),
  object: z.literal("list"),
  usage: z.object({ total_tokens: z.number() }),
  data: z.array(
    z.object({
      object: z.literal("embedding"),
      index: z.number(),
      embedding: z.array(z.number()),
    }),
  ),
});

async function embed(
  modelId: "jina-clip-v1" | "jina-clip-v2" | "jina-embeddings-v4",
  input: Array<{ text: string } | { image: string }>,
  inputType: "retrieval.query" | "retrieval.passage",
  outputDimension?: number,
) {
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
      timeout: 120_000,
      retry: {
        limit: 5,
        methods: ["post"],
        statusCodes: [429, 500, 502, 503, 504],
        afterStatusCodes: [429, 503],
        delay: (attemptCount) => 30_000 + 20_000 * attemptCount,
      },
      hooks: {
        afterResponse: [
          async (_request, _options, response) => {
            if ([429, 500, 502, 503, 504].includes(response.status)) {
              console.error(
                `Jina API error: ${response.status} ${response.statusText}`,
              );
            }
            return response;
          },
        ],
      },
    })
    .json();
  return JinaEmbeddingResponse.parse(response).data;
}

async function getTextEmbedding(
  modelId: "jina-clip-v1" | "jina-clip-v2" | "jina-embeddings-v4",
  input: string,
  outputDimension?: number,
): Promise<EmbeddingOutput> {
  const response = await embed(
    modelId,
    [{ text: input }],
    "retrieval.query",
    outputDimension,
  );
  return { input, embedding: response[0].embedding };
}

async function getImageEmbedding(
  modelId: "jina-clip-v1" | "jina-clip-v2" | "jina-embeddings-v4",
  input: string,
  outputDimension?: number,
): Promise<EmbeddingOutput> {
  const response = await embed(
    modelId,
    [{ image: input }],
    "retrieval.passage",
    outputDimension,
  );
  return { input, embedding: response[0].embedding };
}

async function getImageEmbeddings(
  modelId: "jina-clip-v1" | "jina-clip-v2" | "jina-embeddings-v4",
  inputs: string[],
  outputDimension?: number,
): Promise<EmbeddingOutput[]> {
  const response = await embed(
    modelId,
    inputs.map((input) => ({ image: input })),
    "retrieval.passage",
    outputDimension,
  );
  return response.map((r, i) => ({ input: inputs[i], embedding: r.embedding }));
}

export const models = {
  "jina-clip-v2": {
    dimensions: 1024,
    dbColumn: "embedding_jina_clip_v2",
    getTextEmbedding: (input) => getTextEmbedding("jina-clip-v2", input),
    getImageEmbedding: (input) => getImageEmbedding("jina-clip-v2", input),
    getImageEmbeddings: (inputs) => getImageEmbeddings("jina-clip-v2", inputs),
  },
  "jina-clip-v2-d32": {
    // clip v2 model reduced to 32 dimensions
    // Testing if I can use a low dimensionality model for poor quality retrieval
    // with lower database impact and use a reranker to get good quality rankings
    dimensions: 32,
    dbColumn: "embedding_jina_clip_v2_d32",
    getTextEmbedding: (input) => getTextEmbedding("jina-clip-v2", input, 32),
    getImageEmbedding: (input) => getImageEmbedding("jina-clip-v2", input, 32),
    getImageEmbeddings: (inputs) =>
      getImageEmbeddings("jina-clip-v2", inputs, 32),
  },
  "jina-embeddings-v4": {
    dimensions: 2048,
    dbColumn: "embedding_jina_embeddings_v4",
    getTextEmbedding: (input) =>
      getTextEmbedding("jina-embeddings-v4", input, 2048),
    getImageEmbedding: (input) =>
      getImageEmbedding("jina-embeddings-v4", input, 2048),
    getImageEmbeddings: (inputs) =>
      getImageEmbeddings("jina-embeddings-v4", inputs, 2048),
  },
  "jina-embeddings-v4-d128": {
    dimensions: 128,
    dbColumn: "embedding_jina_embeddings_v4_d128",
    getTextEmbedding: (input) =>
      getTextEmbedding("jina-embeddings-v4", input, 128),
    getImageEmbedding: (input) =>
      getImageEmbedding("jina-embeddings-v4", input, 128),
    getImageEmbeddings: (inputs) =>
      getImageEmbeddings("jina-embeddings-v4", inputs, 128),
  },
} satisfies Record<string, ModelDefinition>;
