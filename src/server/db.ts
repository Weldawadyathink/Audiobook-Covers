import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

type ReadEnv = Pick<Cloudflare.Env, "HYPERDRIVE" | "DATABASE_READ_URL">;
type WriteEnv = Pick<Cloudflare.Env, "HYPERDRIVE" | "DATABASE_WRITE_URL">;

function getReadConnectionString(env: ReadEnv = process.env as ReadEnv) {
  return env.HYPERDRIVE?.connectionString ?? env.DATABASE_READ_URL;
}

function getWriteConnectionString(env: WriteEnv = process.env as WriteEnv) {
  return env.HYPERDRIVE?.connectionString ?? env.DATABASE_WRITE_URL;
}

export function createReadDb(env?: ReadEnv) {
  return drizzle({
    client: postgres(getReadConnectionString(env), {
      max: 1,
      fetch_types: false,
      prepare: true,
    }),
    schema,
  });
}

export function createWriteDb(env?: WriteEnv) {
  return drizzle({
    client: postgres(getWriteConnectionString(env), {
      max: 1,
      fetch_types: false,
      prepare: true,
    }),
    schema,
  });
}
