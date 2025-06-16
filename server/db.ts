import { createPool, createSqlTag, DatabasePool } from "slonik";
import { createPgDriverFactory } from "./create_pg_driver_factory.ts";
import { z } from "zod/v4";
import { Client } from "pg";
import {
  createQueryLoggingInterceptor,
} from "slonik-interceptor-query-logging";
import { env } from "../env.ts";

const global = globalThis as unknown as {
  slonikDbPool: DatabasePool | undefined;
};

export async function getDbPool(): Promise<DatabasePool> {
  if (!global.slonikDbPool) {
    console.log("Creating database pool");
    global.slonikDbPool = await createPool(env.DATABASE_URL, {
      driverFactory: createPgDriverFactory(),
      interceptors: [createQueryLoggingInterceptor()],
    });
  }
  return global.slonikDbPool;
}

export const sql = createSqlTag({
  typeAliases: {
    void: z.object({}).strict(),
  },
});

if (import.meta.main) {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: true,
  });
  console.log("Created database");
  await client.connect();
  console.log("Connected to database");
  console.log((await client.query("SELECT version();")).rows[0].version);
  await client.end();
}
