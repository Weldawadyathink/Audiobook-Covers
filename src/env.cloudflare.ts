import { parseEnv } from "./env";
import { env as workerEnv } from "cloudflare:workers";
import "@tanstack/react-start/server-only";
import "dotenv/config";

export const env = parseEnv({
  ...process.env,
  ...workerEnv,

  // Cloudflare is too lazy to inject hyperdrive connection strings during dev
  DATABASE_READ_URL:
    workerEnv.HYPERDRIVE?.connectionString || process.env.DATABASE_READ_URL,
  DATABASE_WRITE_URL:
    workerEnv.HYPERDRIVE?.connectionString || process.env.DATABASE_WRITE_URL,
});
