import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/env.cloudflare";
import * as schema from "@/db/schema";

export function createReadDb() {
  return drizzle({
    client: postgres(env.DATABASE_READ_URL, {
      max: 1,
      fetch_types: false,
      prepare: true,
    }),
    schema,
  });
}

export function createWriteDb() {
  return drizzle({
    client: postgres(env.DATABASE_WRITE_URL, {
      max: 1,
      fetch_types: false,
      prepare: true,
    }),
    schema,
  });
}
