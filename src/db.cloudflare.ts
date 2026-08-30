import * as db from "@/db";
import { env as cloudflareEnv } from "@/env.cloudflare";

export function createReadDb(options?: db.Options) {
  return db.createReadDb({ env: cloudflareEnv, ...options });
}

export function createWriteDb(options?: db.Options) {
  return db.createWriteDb({ env: cloudflareEnv, ...options });
}
export function createPostgresReadDb(options?: db.Options) {
  return db.createPostgresReadDb({ env: cloudflareEnv, ...options });
}

export function createPostgresWriteDb(options?: db.Options) {
  return db.createPostgresWriteDb({ env: cloudflareEnv, ...options });
}
