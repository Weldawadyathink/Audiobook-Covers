import { z } from "zod/v4";
import { createIsomorphicFn } from "@tanstack/react-start";
import { env as workerEnv } from "cloudflare:workers";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  REPLICATE_API_TOKEN: z.string(),
  APP_STAGE: z.enum(["local", "development", "production"]),
});

export const getEnv = createIsomorphicFn()
  .server(() => {
    // Uses hyperdrive in production. Otherwise uses DATABASE_URL for local development.
    console.log(workerEnv);
    const hyperdrive = workerEnv.HYPERDRIVE?.connectionString ?? null;
    const appStage = workerEnv.APP_STAGE ?? "local";
    return serverEnvSchema.parse({
      ...process.env,
      DATABASE_URL:
        appStage === "local" ? process.env.LOCAL_DATABASE_URL : hyperdrive,
      APP_STAGE: appStage,
    });
  })
  .client(() => {
    throw new Error("This should never be called on the client");
  });
