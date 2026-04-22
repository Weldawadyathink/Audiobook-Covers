import { z } from "zod/v4";
import "dotenv/config";
import { logger } from "@/logger";

type BigQueryCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
} & Record<string, unknown>;

const bigQueryCredentialsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value) as BigQueryCredentials;
    } catch {
      return value;
    }
  },
  z.object({
    type: z.string(),
    project_id: z.string(),
    private_key_id: z.string(),
    private_key: z.string(),
    client_email: z.string(),
    client_id: z.string(),
    auth_uri: z.string(),
    token_uri: z.string(),
    auth_provider_x509_cert_url: z.string(),
    client_x509_cert_url: z.string(),
    universe_domain: z.string(),
  }),
);

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
  ETL_S3_ACCESS_KEY_ID: z.string(),
  ETL_S3_SECRET_ACCESS_KEY: z.string(),
  ETL_S3_BUCKET: z.string(),
  ETL_S3_REGION: z.string(),
  ETL_S3_ENDPOINT: z.string(),
  GOOGLE_BOOKS_API_KEY: z.string(),
  BIGQUERY_CREDENTIALS_JSON: bigQueryCredentialsSchema,
});

type Env = z.output<typeof envSchema>;
type EnvKey = keyof Env & string;

const envShape = envSchema.shape;
const envKeys = Object.keys(envShape) as EnvKey[];

// Allows the user to inject environment variables at runtime
// Returns a proxy object so that missing environment variables are thrown when accessed, not at startup
// Logs missing environment variables at startup
export function parseEnv(
  inject: Partial<Record<EnvKey, string | undefined>> = {},
) {
  const rawEnv = {
    ...process.env,
    ...inject,
  } as Record<string, unknown>;
  const missingKeys = new Set<EnvKey>();
  const parsedEnv = {} as Record<EnvKey, Env[EnvKey] | undefined>;

  for (const key of envKeys) {
    const value = rawEnv[key];

    if (value === undefined) {
      missingKeys.add(key);
      parsedEnv[key] = undefined;
      logger.warn(`Missing environment variable: ${key}`);
      continue;
    }

    parsedEnv[key] = envShape[key].parse(value) as Env[typeof key];
  }

  return new Proxy(parsedEnv as Env, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && missingKeys.has(prop as EnvKey)) {
        throw new Error(`Missing environment variable: ${prop}`);
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

export const env = parseEnv();
