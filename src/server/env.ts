import { z } from "zod/v4";
import { createIsomorphicFn } from "@tanstack/react-start";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  REPLICATE_API_TOKEN: z.string(),
  APP_STAGE: z.enum(["local", "development", "production"]),
});

export const getEnv = createIsomorphicFn()
  .server(() => {
    // Uses hyperdrive in production. Otherwise uses DATABASE_URL for local development.
    console.log(
      `Using ${process.env.HYPERDRIVE ? "HYPERDRIVE" : "DATABASE_URL"} for database connection`,
    );
    console.log(process.env);
    return serverEnvSchema.parse({
      ...process.env,
      DATABASE_URL:
        process.env.HYPERDRIVE ?? process.env.LOCAL_DATABASE_URL ?? null,
    });
  })
  .client(() => {
    throw new Error("This should never be called on the client");
  });
