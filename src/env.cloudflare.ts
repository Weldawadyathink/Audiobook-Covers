import { parseEnv } from "./env";
import "@tanstack/react-start/server-only";

type ParsedEnv = ReturnType<typeof parseEnv>;
type EnvKey = keyof ParsedEnv;

const parsedEnvCache = new WeakMap<object, ParsedEnv>();

const envKeys = [
  "APP_STAGE",
  "DATABASE_READ_URL",
  "DATABASE_WRITE_URL",
  "REPLICATE_API_TOKEN",
  "VITE_PUBLIC_POSTHOG_HOST",
  "VITE_PUBLIC_POSTHOG_KEY",
  "VOYAGE_API_KEY",
  "JINA_API_KEY",
  "OPENROUTER_API_KEY",
  "TRIGGER_API_KEY",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "ETL_S3_ACCESS_KEY_ID",
  "ETL_S3_SECRET_ACCESS_KEY",
  "ETL_S3_BUCKET",
  "ETL_S3_REGION",
  "ETL_S3_ENDPOINT",
  "BIGQUERY_CREDENTIALS_JSON",
  "ELASTICSEARCH_URL",
  "ELASTICSEARCH_API_KEY",
] as const satisfies readonly EnvKey[];

function getParsedEnv() {
  const cached = parsedEnvCache.get(process.env);
  if (cached) {
    return cached;
  }

  const runtimeEnv: Record<string, unknown> = { ...process.env };
  for (const key of envKeys) {
    runtimeEnv[key] = process.env[key];
  }

  const parsed = parseEnv(runtimeEnv);
  parsedEnvCache.set(process.env, parsed);
  return parsed;
}

export const env = new Proxy({} as ParsedEnv, {
  get(_target, prop) {
    return Reflect.get(getParsedEnv(), prop);
  },
});
