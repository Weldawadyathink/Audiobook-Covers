import { parseEnv } from "./env";
import { env as workerEnv } from "cloudflare:workers";
import "@tanstack/react-start/server-only";
import "dotenv/config";

export const env = parseEnv({
  ...process.env,
  ...workerEnv,

  DATABASE_READ_URL:
    workerEnv.HYPERDRIVE?.connectionString ||
    workerEnv.DATABASE_READ_URL ||
    process.env.DATABASE_READ_URL,
  DATABASE_WRITE_URL:
    workerEnv.HYPERDRIVE?.connectionString ||
    workerEnv.DATABASE_WRITE_URL ||
    process.env.DATABASE_WRITE_URL,
});
