export interface EmbeddingOutput {
  input: string;
  embedding: number[];
}

export interface ModelDefinition {
  dimensions: number;
  dbColumn: string;
  getTextEmbedding: (input: string) => Promise<EmbeddingOutput>;
  getImageEmbedding: (input: string) => Promise<EmbeddingOutput>;
}

import { models as replicateModels } from "./replicate";
import { models as voyageModels } from "./voyage";
import { ModelName, defaultModelName } from "@/shared/modelConstants";

export { defaultModelName } from "@/shared/modelConstants";

// satisfies ensures every ModelName has an implementation at compile time.
// Add a model here and TypeScript will error until an implementation exists.
export const modelMap = {
  ...replicateModels,
  ...voyageModels,
} satisfies Record<ModelName, ModelDefinition>;

export function getModel(name: string): ModelDefinition {
  return (modelMap as Record<string, ModelDefinition>)[name] ?? modelMap[defaultModelName];
}
