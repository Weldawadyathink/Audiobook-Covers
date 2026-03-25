import { z } from "zod/v4";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_READ_URL: z.url(),
  DATABASE_WRITE_URL: z.url(),
  REPLICATE_API_TOKEN: z.string(),
  APP_STAGE: z.enum(["local", "development", "production", "unknown"]),
  VITE_PUBLIC_POSTHOG_HOST: z.string(),
  VITE_PUBLIC_POSTHOG_KEY: z.string(),
  VOYAGE_API_KEY: z.string(),
  JINA_API_KEY: z.string(),
  OPENROUTER_API_KEY: z.string(),
  TRIGGER_API_KEY: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string(),
  S3_ENDPOINT: z.string(),
  GOOGLE_BOOKS_API_KEY: z.string(),
});

// Allows the user to inject environment variables at runtime
export function parseEnv(inject: Record<string, string> = {}) {
  return envSchema.parse({
    ...process.env,
    ...inject,
  });
}

export const env = parseEnv();
