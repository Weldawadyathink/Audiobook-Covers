import { createPool, createSqlTag } from "slonik";
import { createPgDriverFactory } from "@slonik/pg-driver";
import { z } from "zod";

const dbUrl = Deno.env.get("DATABASE_URL");
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable not set!");
}

export const pool = await createPool(dbUrl, {
  driverFactory: createPgDriverFactory(),
});

export const sql = createSqlTag({
  typeAliases: {
    imageData: z.object({
      id: z.string().uuid(),
      source: z.string(),
      extension: z.string(),
      blurhash: z.string(),
    }),
    imageDataWithDistance: z.object({
      id: z.string().uuid(),
      source: z.string(),
      extension: z.string(),
      blurhash: z.string(),
      distance: z.number(),
    }),
  },
});
