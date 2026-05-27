import ky from "ky";
import { z } from "zod";
import { ModelDefinition, EmbeddingOutput } from "./search";
import { env } from "@/env.cloudflare";

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
  modelId: "jina-clip-v2",
  input: Array<{ text: string } | { image: string }>,
  inputType: "retrieval.query" | "retrieval.passage",
  outputDimension?: number,
) {
  const response = await ky
    .post("https://api.jina.ai/v1/embeddings", {
      headers: {
        Authorization: `Bearer ${env.JINA_API_KEY}`,
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
  modelId: "jina-clip-v2",
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
  modelId: "jina-clip-v2",
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
  modelId: "jina-clip-v2",
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
    getImageEmbeddings: (inputs) =>
      getImageEmbeddings("jina-clip-v2", inputs),
  },
} satisfies Record<string, ModelDefinition>;
