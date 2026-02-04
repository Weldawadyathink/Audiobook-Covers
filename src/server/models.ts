import { sql } from "@/server/db";
import { z } from "zod/v4";
import ky from "ky";
import { getEnv } from "@/server/env";
import Replicate from "replicate";

const replicate = new Replicate();
const flyAppName = getEnv().FLY_APP_NAME;

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
  // TODO: temporary, all calls will return the s0 model results
  const json = await ky
    .post(`http://${flyAppName}.fly.dev:8000/predictions`, {
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
  "andreasjansson-clip",
] as const;
export const defaultModel = "andreasjansson-clip" as const;
export const zModelOptions = z.enum(modelOptions).catch(defaultModel);
export type ModelOptions = z.infer<typeof zModelOptions>;
export const models: { readonly [K in ModelOptions]: ModelDefinition } = {
  "andreasjansson-clip": {
    dimensions: 768,
    getBulkEmbeddings: async (inputs) => {
      const combinedInput = inputs.join("\n");
      const result = (await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: combinedInput,
          },
        },
      )) as EmbeddingOutput[];
      return result;
    },
    getTextEmbedding: async (input) => {
      const result = (await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: input,
          },
        },
      )) as EmbeddingOutput[];
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = (await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: input,
          },
        },
      )) as EmbeddingOutput[];
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_andreasjansson_clip"]),
  },
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
