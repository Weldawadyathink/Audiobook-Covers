import { image } from "../db/schema.ts";
import { PgColumn } from "drizzle-orm/pg-core";
import Replicate from "replicate";

const replicate = new Replicate({
  auth: Deno.env.get("REPLICATE_API_TOKEN"),
});

export interface EmbeddingOutput {
  input: string;
  embedding: number[];
}

export interface ModelDefinition {
  dimensions: number;
  dbColumn: PgColumn;
  getTextEmbedding: (input: string) => Promise<EmbeddingOutput>;
  getImageEmbedding: (input: string) => Promise<EmbeddingOutput>;
}

export const models: { [key: string]: ModelDefinition } = {
  "mobileclip_s1": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      return await replicate.run(
        "weldawadyathink/mobileclip:f3abf71398b6560d9fe293a71a7a76f67b5ad2249b3d6e26ac65d61bba4e8db7",
        {
          input: {
            text: input,
          },
        },
      ) as EmbeddingOutput;
    },
    getImageEmbedding: async (imageUrl) => {
      return await replicate.run(
        "weldawadyathink/mobileclip:f3abf71398b6560d9fe293a71a7a76f67b5ad2249b3d6e26ac65d61bba4e8db7",
        {
          input: {
            image: imageUrl,
          },
        },
      ) as EmbeddingOutput;
    },
    dbColumn: image.embedding_mobileclip_s1,
  },
  original: {
    dimensions: 768,
    dbColumn: image.embedding,
    getTextEmbedding: async (input) => {
      console.log(`Getting text embedding for ${input}`);
      const [result] = await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            text: input,
          },
        },
      ) as Array<{ input: string; embedding: [number] }>;
      return result;
    },
    getImageEmbedding: async (imageUrl) => {
      const [result] = await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            image: imageUrl,
          },
        },
      ) as Array<{ input: string; embedding: [number] }>;
      return result;
    },
  },
};

export const defaultModel: ModelOptions = "mobileclip_s1";

export type ModelOptions = keyof typeof models;
