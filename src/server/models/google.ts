import { ModelDefinition } from "./models";
import { z } from "zod/v4";
import ky from "ky";
import { getEnv } from "@/server/env";

const MODEL_ID = "multimodalembedding@001";

const { GOOGLE_CLOUD_PROJECT, GOOGLE_VERTEX_LOCATION, GOOGLE_API_KEY } =
  getEnv();

const api = ky.create({
  prefixUrl: `https://${GOOGLE_VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_VERTEX_LOCATION}/publishers/google/models/${MODEL_ID}`,
  headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": GOOGLE_API_KEY,
  },
  timeout: false,
  retry: {
    limit: 10,
    methods: ["post"],
    backoffLimit: 1000,
  },
});

const predictResponseSchema = z.object({
  predictions: z
    .array(
      z.object({
        imageEmbedding: z.array(z.number()).optional(),
        textEmbedding: z.array(z.number()).optional(),
      }),
    )
    .min(1),
});

async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const arrayBuffer = await ky.get(imageUrl).arrayBuffer();
  if (typeof Buffer !== "undefined") {
    return Buffer.from(arrayBuffer).toString("base64");
  }
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const models = [
  {
    dimensions: 1408,
    dbColumn: "embedding_google_multimodal",
    getTextEmbedding: async (input) => {
      const data = await api
        .post(":predict", {
          json: {
            instances: [{ text: input }],
          },
        })
        .json();
      const parsed = predictResponseSchema.parse(data);
      const embedding = parsed.predictions[0].textEmbedding;
      if (!embedding) {
        throw new Error("Google API did not return a text embedding");
      }
      return { input, embedding };
    },
    getImageEmbedding: async (input) => {
      const base64Image = await imageUrlToBase64(input);
      const data = await api
        .post(":predict", {
          json: {
            instances: [{ image: { bytesBase64Encoded: base64Image } }],
          },
        })
        .json();
      const parsed = predictResponseSchema.parse(data);
      const embedding = parsed.predictions[0].imageEmbedding;
      if (!embedding) {
        throw new Error("Google API did not return an image embedding");
      }
      return { input, embedding };
    },
  },
];
