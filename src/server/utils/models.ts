// This is in a separate file to allow direct inclusion in client.
// The website may need access to models data directly, so this entire function
// must never have server code.

export const models = {
  "Benny1923/metaclip-b16-fullcc2.5b": {
    // Good quality search results
    dimensions: 512,
    dbColumn: "metaclip_b16",
  },
  "Xenova/clip-vit-large-patch14": {
    // Possibly the lowest quality search results
    dimensions: 768,
    dbColumn: "vit_large_patch14",
  },
  "Xenova/mobileclip_blt": {
    // Appears to be the fastest. Embedding is only slightly faster, but DB lookup is much faster.
    dimensions: 512,
    dbColumn: "mobileclip_blt",
  },
};

export type ModelOptions = keyof typeof models;
