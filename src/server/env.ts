import { z } from "zod/v4";
import { createIsomorphicFn } from "@tanstack/react-start";
import { env as workerEnv } from "cloudflare:workers";

const serverEnvSchema = z.object({
  DATABASE_READ_URL: z.url(),
  DATABASE_WRITE_URL: z.url(),
  REPLICATE_API_TOKEN: z.string(),
  APP_STAGE: z.enum(["local", "development", "production"]),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_VERTEX_LOCATION: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  VITE_PUBLIC_POSTHOG_HOST: z.string(),
  VITE_PUBLIC_POSTHOG_KEY: z.string(),
});

export const getEnv = createIsomorphicFn()
  .server(() => {
    // Uses hyperdrive in production. Otherwise uses DATABASE_URL for local development.
    const hyperdrive_read = workerEnv.HYPERDRIVE?.connectionString ?? null;
    // When read only replicas are added, a new hyperdrive binding can be added.
    const hyperdrive_write = workerEnv.HYPERDRIVE?.connectionString ?? null;

    const appStage =
      workerEnv.APP_STAGE ?? process.env.APP_STAGE ?? "production";
    const isLocalDev = process.env.LOCAL_DATABASE_URL ? true : false;
    console.log(
      isLocalDev ? `Using local database url` : `Using hyperdrive database url`,
    );
    return serverEnvSchema.parse({
      ...process.env,
      ...workerEnv,
      DATABASE_READ_URL: isLocalDev
        ? process.env.LOCAL_DATABASE_URL
        : hyperdrive_read,
      DATABASE_WRITE_URL: isLocalDev
        ? process.env.LOCAL_DATABASE_URL
        : hyperdrive_write,
      APP_STAGE: appStage,
    });
  })
  .client(() => {
    throw new Error("This should never be called on the client");
  });
