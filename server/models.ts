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
    embedding: z.array(z.coerce.number()),
    input: z.coerce.string(),
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
  "mobileclip_s0": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-s0:d0207d14f31bd4deb30922f300813e65eb077966daf8c419312bf6f3e819ff5c",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-s0:d0207d14f31bd4deb30922f300813e65eb077966daf8c419312bf6f3e819ff5c",
        input,
      );
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s0"]),
  },
  "mobileclip_s1": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-s1:af32db66cfc8a89acf4564719df79b89dcbc9ef4ce2e971f1a349db0a7d23cc5",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-s1:af32db66cfc8a89acf4564719df79b89dcbc9ef4ce2e971f1a349db0a7d23cc5",
        input,
      );
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s1"]),
  },
  "mobileclip_s2": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-s2:713b5bce1c13437d6d9e72feb101bbb481345364c1546a77fe3d0d14ea494709",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-s2:713b5bce1c13437d6d9e72feb101bbb481345364c1546a77fe3d0d14ea494709",
        input,
      );
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_s2"]),
  },
  "mobileclip_b": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-b:448e4cabca8b47b23589a379065cbf4681ac6b980e592dae8d4bb2c717164621",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-b:448e4cabca8b47b23589a379065cbf4681ac6b980e592dae8d4bb2c717164621",
        input,
      );
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_b"]),
  },
  "mobileclip_blt": {
    dimensions: 512,
    getTextEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-blt:17507e65350e514e0f44c8831a106761e330276a4b0f3339597b42fba71e4914",
        input,
      );
      return result[0];
    },
    getImageEmbedding: async (input) => {
      const result = await genericReplicateClipModel(
        "weldawadyathink/mobileclip-blt:17507e65350e514e0f44c8831a106761e330276a4b0f3339597b42fba71e4914",
        input,
      );
      return result[0];
    },
    dbColumn: sql.identifier(["embedding_mobileclip_blt"]),
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
