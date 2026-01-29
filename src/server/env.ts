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
      })
      .parse(process.env);

    // Determine schema: explicit DATABASE_SCHEMA, or derive from NODE_ENV
    // Default to 'audiobookcovers_dev' for development, 'audiobookcovers' for production
    // Is this ever used?
    const schema =
      env.DATABASE_SCHEMA ||
      (env.NODE_ENV === "production"
        ? "audiobookcovers"
        : "audiobookcovers_dev");

    return {
      ...env,
      DATABASE_SCHEMA: schema,
    };
  })
  .client(() => {
    throw new Error("This should never be called on the client");
  });
