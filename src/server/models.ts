import { sql } from "@/server/db";
import { z } from "zod/v4";
import ky from "ky";

export interface EmbeddingOutput {
  input: string;
  embedding: number[];
}

export interface ModelDefinition {
  dimensions: number;
  dbColumn: ReturnType<typeof sql.identifier>;
  getTextEmbedding: (input: string) => Promise<EmbeddingOutput>;
  getImageEmbedding: (input: string) => Promise<EmbeddingOutput>;
}

const publicClipModelValidator = z
  .array(
    // Output format for public andreasjansson/clip-features on replicate
    z.object({
      embedding: z.array(z.coerce.number()),
      input: z.coerce.string(),
    }),
  )
  .min(1);

async function genericFlyClipModel(modelId: string, input: string) {
  const json = await ky
    .post(`https://${modelId}.fly.dev/predictions`, {
      json: {
        inputs: input,
      },
      timeout: false,
      retry: {
        limit: 10,
        methods: ["post"],
        backoffLimit: 1000,
      },
    })
    .json();
  return publicClipModelValidator.parse(json);
}

export const modelOptions = [
  "mobileclip_s0",
  "mobileclip_s1",
  "mobileclip_s2",
  "mobileclip_b",
  "mobileclip_blt",
] as const;
export const defaultModel = "mobileclip_s0" as const;
export const zModelOptions = z.enum(modelOptions).catch(defaultModel);
export type ModelOptions = z.infer<typeof zModelOptions>;

export const models: { readonly [K in ModelOptions]: ModelDefinition } = {
  mobileclip_s0: {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-s0", input);
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-s0", input);
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s0"]),
  },
  mobileclip_s1: {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-s1", input);
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-s1", input);
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s1"]),
  },
  mobileclip_s2: {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-s2", input);
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-s2", input);
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s2"]),
  },
  mobileclip_b: {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-b", input);
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-b", input);
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_b"]),
  },
  mobileclip_blt: {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-blt", input);
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericFlyClipModel("mobileclip-blt", input);
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_blt"]),
  },
} as const;
