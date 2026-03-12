// Plain model name constants, safe to import on both client and server.
// Keep in sync with src/server/models/models.ts

export const modelNames = [
  "andreasjansson-clip",
  "voyage-multimodal-3",
  "voyage-multimodal-3.5",
  "jina-clip-v1",
  "jina-clip-v2",
  "jina-clip-v2-d32",
] as const;

export type ModelName = (typeof modelNames)[number];

export const defaultModelName: ModelName = "voyage-multimodal-3";
