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

import { models as jinaModels } from "./jina";

export const defaultModelName = "jina-clip-v2";

export const modelMap: Record<string, ModelDefinition> = {
  ...jinaModels,
};

export function getModel(name: string): ModelDefinition {
  return modelMap[name] ?? modelMap[defaultModelName];
}
