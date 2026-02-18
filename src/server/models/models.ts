export interface EmbeddingOutput {
  input: string;
  embedding: number[];
}

export interface ModelDefinition {
  name: string;
  dimensions: number;
  dbColumn: string;
  getTextEmbedding: (input: string) => Promise<EmbeddingOutput>;
  getImageEmbedding: (input: string) => Promise<EmbeddingOutput>;
}

import { models as replicateModels } from "./replicate";
import { models as googleModels } from "./google";

export const models = [...replicateModels, ...googleModels];
