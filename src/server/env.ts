import { z } from "zod/v4";
import { createIsomorphicFn } from "@tanstack/react-start";

export const getEnv = createIsomorphicFn()
  .server(() => {
    const env = z
      .object({
        DATABASE_URL: z.url(),
        DATABASE_SCHEMA: z.string().optional(),
        NODE_ENV: z.string().optional(),
        FLY_APP_NAME: z.string(),
        REPLICATE_API_TOKEN: z.string(),
      })
      .parse(process.env);

    return {
      ...env,
    };
  })
  .client(() => {
    throw new Error("This should never be called on the client");
  });
