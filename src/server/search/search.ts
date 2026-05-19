export interface EmbeddingOutput {
  input: string;
  embedding: number[];
}

export interface ModelDefinition {
  dimensions: number;
  dbColumn: string;
  getTextEmbedding: (
    input: string,
    env?: Cloudflare.Env,
  ) => Promise<EmbeddingOutput>;
  getImageEmbedding: (
    input: string,
    env?: Cloudflare.Env,
  ) => Promise<EmbeddingOutput>;
  getImageEmbeddings: (
    inputs: string[],
    env?: Cloudflare.Env,
  ) => Promise<EmbeddingOutput[]>;
}

import { models as replicateModels } from "./replicate";
import { models as voyageModels } from "./voyage";
import { models as jinaModels } from "./jina";

export const defaultModelName = "voyage-multimodal-3";

export const modelMap: Record<string, ModelDefinition> = {
  ...replicateModels,
  ...voyageModels,
  ...jinaModels,
};

export function getModel(name: string): ModelDefinition {
  return modelMap[name] ?? modelMap[defaultModelName];
}
