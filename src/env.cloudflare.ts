import { parseEnv, type Env } from "./env";
import "@tanstack/react-start/server-only";
import { env as cloudflareEnv } from "cloudflare:workers";

/**
 * Parsed on first property access rather than at module scope.
 *
 * Reading `HYPERDRIVE.connectionString` counts as asynchronous I/O, which the
 * Workers runtime forbids in global scope. Whether this module is evaluated in
 * global scope or inside a request handler depends on how Vite happens to chunk
 * the worker bundle — an unrelated import can move it — so doing the read
 * eagerly makes the whole site 500 with
 * "Disallowed operation called within global scope". Deferring it means the
 * first read always happens inside a handler, where it is legal.
 */
let parsed: Env | undefined;

function getEnv(): Env {
  // Wrangler can only generate types for bindings declared in wrangler.jsonc.
  // These URL fallbacks are dashboard-managed secrets, so they exist at runtime
  // without appearing on the generated Cloudflare.Env type in a clean CI build.
  const runtimeEnv = cloudflareEnv as typeof cloudflareEnv & {
    DATABASE_READ_URL?: string;
    DATABASE_WRITE_URL?: string;
  };

  parsed ??= parseEnv({
    ...process.env,
    ...runtimeEnv,
    DATABASE_READ_URL:
      runtimeEnv.HYPERDRIVE?.connectionString ||
      runtimeEnv.DATABASE_READ_URL ||
      process.env.DATABASE_READ_URL,
    DATABASE_WRITE_URL:
      runtimeEnv.HYPERDRIVE?.connectionString ||
      runtimeEnv.DATABASE_WRITE_URL ||
      process.env.DATABASE_WRITE_URL,
  });
  return parsed;
}

export const env = new Proxy({} as Env, {
  get: (_target, prop) => Reflect.get(getEnv(), prop),
  has: (_target, prop) => Reflect.has(getEnv(), prop),
  ownKeys: () => Reflect.ownKeys(getEnv()),
  getOwnPropertyDescriptor: (_target, prop) =>
    Reflect.getOwnPropertyDescriptor(getEnv(), prop),
});
