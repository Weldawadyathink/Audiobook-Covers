import { parseEnv } from "./env";
import { env as workerEnv } from "cloudflare:workers";
import "@tanstack/react-start/server-only";
import "dotenv/config";

console.log(workerEnv);
console.log(process.env);

export const env = parseEnv({
  ...process.env,
  ...workerEnv,
  DATABASE_READ_URL: workerEnv.HYPERDRIVE?.connectionString!,
  DATABASE_WRITE_URL: workerEnv.HYPERDRIVE?.connectionString!,
});
