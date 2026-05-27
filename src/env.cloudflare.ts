import { parseEnv } from "./env";
import "@tanstack/react-start/server-only";
import { env as cloudflareEnv } from "cloudflare:workers";

export const env = parseEnv({
  ...process.env,
  ...cloudflareEnv,
  DATABASE_READ_URL: cloudflareEnv.HYPERDRIVE?.connectionString,
  DATABASE_WRITE_URL: cloudflareEnv.HYPERDRIVE?.connectionString,
});
