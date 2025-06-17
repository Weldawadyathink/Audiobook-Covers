import { z } from "zod/v4";

export const env = z
  .object({
    DATABASE_URL: z.url(),
  })
  .parse(process.env);
