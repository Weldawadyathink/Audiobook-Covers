// This is in a separate file to allow direct inclusion in client.
// The website may need access to models data directly, so this entire function
// must never have server code.

export type ModelDefinition = {
  dimensions: number;
  dbColumn: string;
  huggingfaceId: string;
  localPath?: string | null;
};

export const models: { [key: string]: ModelDefinition } = {
  "Benny1923/metaclip-b16-fullcc2.5b": {
    // Good quality search results
    dimensions: 512,
    dbColumn: "metaclip_b16",
    huggingfaceId: "Benny1923/metaclip-b16-fullcc2.5b",
    localPath: null,
  },
  "openai_clip": {
    // Possibly the lowest quality search results
    dimensions: 768,
    dbColumn: "vit_large_patch14",
    huggingfaceId: "Xenova/clip-vit-large-patch14",
    localPath: null,
  },
  "mobileclip": {
    // Appears to be the fastest. Embedding is only slightly faster, but DB lookup is much faster.
    dimensions: 512,
    dbColumn: "mobileclip_blt",
    huggingfaceId: "Xenova/mobileclip_blt",
    // localPath: "./models/mobileclip",
  },
};

export const defaultModel = "mobileclip";

export type ModelOptions = keyof typeof models;
