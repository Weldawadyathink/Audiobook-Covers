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

async function genericReplicateClipModel(
  modelId: `${string}/${string}` | `${string}/${string}:${string}`,
  input: string,
) {
  console.log(
    `Querying Replicate model ${modelId.split(":")[0]} with query ${input}`,
  );
  const result = await replicate.run(modelId, {
    input: {
      inputs: input,
    },
  });
  return publicClipModelValidator.parse(result);
}

export const models: { [key: string]: ModelDefinition } = {
  "mobileclip_s1": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip:283df5c42d3ce67dedc3e80e24dc328d6547b34d9101b7ed7bd3f39185c3d74c",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip:283df5c42d3ce67dedc3e80e24dc328d6547b34d9101b7ed7bd3f39185c3d74c",
        input,
      );
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s1"]),
  },
  original: {
    dimensions: 768,
    dbColumn: sql.identifier(["embedding"]),
    getTextEmbedding: async (input) => {
      console.log(`Getting text embedding for ${input}`);
      const result = await genericReplicateClipModel(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        input,
      );
      return result[0];
    },
  },
};

export const defaultModel: ModelOptions = "mobileclip_s1";

export type ModelOptions = keyof typeof models;
