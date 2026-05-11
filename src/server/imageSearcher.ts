import {
  shapeImageDataArray,
  shapeImageData,
  ImageData,
} from "@/server/imageData";
import { getDbReadConnection } from "@/server/db";
import { getModel, defaultModelName } from "@/server/search/search";
import { DBImageDataValidator } from "@/server/imageData";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { logAnalyticsEvent } from "@/server/analytics";
import { getReranker } from "@/server/rerankers/rerankers";
import { env } from "@/env.cloudflare";
import { waitUntil } from "cloudflare:workers";

export const coverSearch = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      q: z.string().default(""),
      title: z.string().optional(),
      author: z.string().optional(),
    }),
  )
  .handler(async ({ data: { q, title, author } }): Promise<ImageData[]> => {
    if (!title && !author && q === "") return [];
    const searchQuery = q || `${title} ${author}`;

    return;
  });
