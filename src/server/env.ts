import { z } from "zod/v4";
import { createIsomorphicFn } from "@tanstack/react-start";

export const getEnv = createIsomorphicFn()
  .server(() => {
    const env = z
      .object({
        DATABASE_URL: z.url(),
        REPLICATE_API_TOKEN: z.string(),
        APP_STAGE: z.enum(["local", "development", "production"]),
      })
      .parse(process.env);

    return {
      ...env,
    };
  })
  .client(() => {
    throw new Error("This should never be called on the client");
  });
