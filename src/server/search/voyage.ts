import { createVoyage } from "voyage-ai-provider";
import { ModelDefinition, EmbeddingOutput } from "./search";
import { ModelName } from "@/shared/modelConstants";
import { getEnv } from "@/server/env";
import { embed, embedMany } from "ai";

const voyage = createVoyage({
  apiKey: getEnv().VOYAGE_API_KEY,
});

export const models = {
  "voyage-multimodal-3": {
    dimensions: 1024,
    dbColumn: "embedding_voyage_multimodal_3",
    getTextEmbedding: async (input) => {
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
} satisfies Partial<Record<ModelName, ModelDefinition>>;
