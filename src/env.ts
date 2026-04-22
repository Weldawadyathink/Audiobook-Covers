import { z } from "zod/v4";
import "dotenv/config";

type BigQueryCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
} & Record<string, unknown>;

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
  BIGQUERY_CREDENTIALS_JSON: z.string().optional(),
});

// Allows the user to inject environment variables at runtime
export function parseEnv(inject: Record<string, string> = {}) {
  return envSchema.parse({
    ...process.env,
    ...inject,
  });
}

export function getBigQueryCredentials(
  rawCredentials = env.BIGQUERY_CREDENTIALS_JSON,
): BigQueryCredentials | undefined {
  if (!rawCredentials) {
    return undefined;
  }

  let parsedCredentials: unknown;
  try {
    parsedCredentials = JSON.parse(rawCredentials);
  } catch (error) {
    throw new Error("BIGQUERY_CREDENTIALS_JSON must be valid JSON", {
      cause: error,
    });
  }

  if (!parsedCredentials || typeof parsedCredentials !== "object") {
    throw new Error("BIGQUERY_CREDENTIALS_JSON must contain a JSON object");
  }

  const credentials = parsedCredentials as Record<string, unknown>;

  if (
    typeof credentials.client_email !== "string" ||
    typeof credentials.private_key !== "string"
  ) {
    throw new Error(
      "BIGQUERY_CREDENTIALS_JSON must include client_email and private_key",
    );
  }

  return {
    ...credentials,
    client_email: credentials.client_email,
    private_key: credentials.private_key.replace(/\\n/g, "\n"),
    project_id:
      typeof credentials.project_id === "string"
        ? credentials.project_id
        : undefined,
  };
}

export const env = parseEnv();
