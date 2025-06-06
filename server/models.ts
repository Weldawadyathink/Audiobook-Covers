import Replicate from "replicate";
import { sql } from "./db.ts";
import { z } from "zod/v4";

const replicate = new Replicate({
  auth: Deno.env.get("REPLICATE_API_TOKEN"),
});

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

const publicClipModelValidator = z.array(
  // Output format for public andreasjansson/clip-features on replicate
  z.object({
    embedding: z.array(z.number()),
    input: z.string(),
  }),
);

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
    dbColumn: sql.identifier(["embedding_mobileclip_s1"]),
  },
  original: {
    dimensions: 768,
    dbColumn: sql.identifier(["embedding"]),
    getTextEmbedding: async (input) => {
      console.log(`Getting text embedding for ${input}`);
      const result = await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: input,
          },
        },
      );
      const parsed = publicClipModelValidator.parse(result);
      return parsed[0];
    },
    getImageEmbedding: async (imageUrl) => {
      const result = await replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        {
          input: {
            inputs: imageUrl,
          },
        },
      );
      const parsed = publicClipModelValidator.parse(result);
      return parsed[0];
    },
  },
};

export const defaultModel: ModelOptions = "original";

export type ModelOptions = keyof typeof models;
