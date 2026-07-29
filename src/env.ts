import { z } from "zod/v4";

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
  APP_STAGE: z.enum(["local", "development", "production", "unknown"]),
  VITE_PUBLIC_POSTHOG_HOST: z.string(),
  VITE_PUBLIC_POSTHOG_KEY: z.string(),
  JINA_API_KEY: z.string(),
  OPENROUTER_API_KEY: z.string(),
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
  BIGQUERY_CREDENTIALS_JSON: bigQueryCredentialsSchema,
  REDDIT_CLIENT_ID: z.string(),
  REDDIT_CLIENT_SECRET: z.string(),
  /**
   * Reddit requires a descriptive, unique User-Agent and throttles hard on the
   * default ones every HTTP library sends. Format Reddit asks for:
   *   <platform>:<app id>:<version> (by /u/<reddit username>)
   */
  REDDIT_USER_AGENT: z.string(),
});

export type Env = z.infer<typeof envSchema>;

// Allows the user to inject environment variables at runtime
// Returns a proxy object so that missing environment variables are thrown when accessed, not at startup
// Logs missing environment variables at startup
export function parseEnv(inject: Record<string, unknown> = {}): Env {
  const rawEnv = {
    ...inject,
  };
  const parsedEnv = envSchema.partial().parse(rawEnv);

  for (const key of Object.keys(envSchema.shape)) {
    if (parsedEnv[key] === undefined) {
      console.warn(`Missing environment variable: ${key}`);
    }
  }

  return new Proxy(parsedEnv as z.infer<typeof envSchema>, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value === undefined) {
        throw new Error(`Missing environment variable: ${String(prop)}`);
      }
      return value;
    },
  });
}
