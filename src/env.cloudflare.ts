import { parseEnv } from "./env";
import { env as workerEnv } from "cloudflare:workers";
import "@tanstack/react-start/server-only";
import "dotenv/config";

export const env = parseEnv({
  ...workerEnv,
  DATABASE_READ_URL: workerEnv.HYPERDRIVE?.connectionString!,
  DATABASE_WRITE_URL: workerEnv.HYPERDRIVE?.connectionString!,
});
