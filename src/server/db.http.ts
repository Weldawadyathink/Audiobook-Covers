import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/env.cloudflare";
import * as schema from "@/db/schema";

export function createReadDb() {
  neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;
  return drizzle({ client: neon(env.DATABASE_READ_URL), schema });
}

export function createWriteDb() {
  neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;
  return drizzle({ client: neon(env.DATABASE_WRITE_URL), schema });
}
