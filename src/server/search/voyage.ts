import { createVoyage } from "voyage-ai-provider";
import { ModelDefinition, EmbeddingOutput } from "./search";
import { env } from "@/env.cloudflare";
import { embed, embedMany } from "ai";

function getVoyage() {
  return createVoyage({
    apiKey: env.VOYAGE_API_KEY,
  });
}

export const models = {
  "voyage-multimodal-3": {
    dimensions: 1024,
    dbColumn: "embedding_voyage_multimodal_3",
    getTextEmbedding: async (input) => {
      const voyage = getVoyage();
      const { embedding } = await embed({
        model: voyage.multimodalEmbeddingModel("voyage-multimodal-3"),
        value: input,
        providerOptions: {
          voyage: {
            inputType: "query",
          },
        },
      });
      return { input, embedding };
    },
    getImageEmbedding: async (input) => {
      const voyage = getVoyage();
      const { embeddings } = await embedMany({
        model: voyage.multimodalEmbeddingModel("voyage-multimodal-3"),
        values: [input],
        providerOptions: {
          voyage: {
            inputType: "document",
          },
        },
      });
      return { input, embedding: embeddings[0] };
    },
    getImageEmbeddings: async (inputs) => {
      const voyage = getVoyage();
      const { embeddings } = await embedMany({
        model: voyage.multimodalEmbeddingModel("voyage-multimodal-3"),
        values: inputs,
        providerOptions: {
          voyage: {
            inputType: "document",
          },
        },
      });
      return embeddings.map((embedding, i) => ({
        input: inputs[i],
        embedding,
      }));
    },
  },
  "voyage-multimodal-3.5": {
    dimensions: 1024,
    dbColumn: "embedding_voyage_multimodal_3_5",
    getTextEmbedding: async (input) => {
      const voyage = getVoyage();
      const { embedding } = await embed({
        model: voyage.multimodalEmbeddingModel("voyage-multimodal-3.5"),
        value: input,
        providerOptions: {
          voyage: {
            inputType: "query",
          },
        },
      });
      return { input, embedding };
    },
    getImageEmbedding: async (input) => {
      const voyage = getVoyage();
      const { embeddings } = await embedMany({
        model: voyage.multimodalEmbeddingModel("voyage-multimodal-3.5"),
        values: [input],
        providerOptions: {
          voyage: {
            inputType: "document",
          },
        },
      });
      return { input, embedding: embeddings[0] };
    },
    getImageEmbeddings: async (inputs) => {
      const voyage = getVoyage();
      const { embeddings } = await embedMany({
        model: voyage.multimodalEmbeddingModel("voyage-multimodal-3.5"),
        values: inputs,
        providerOptions: {
          voyage: {
            inputType: "document",
          },
        },
      });
      return embeddings.map((embedding, i) => ({
        input: inputs[i],
        embedding,
      }));
    },
  },
} satisfies Record<string, ModelDefinition>;
