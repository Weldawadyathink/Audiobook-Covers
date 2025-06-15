import { createPool, createSqlTag, DatabasePool } from "slonik";
import { createPgDriverFactory } from "./create_pg_driver_factory.ts";
import { z } from "zod";
import { Client } from "pg";
import {
  createQueryLoggingInterceptor,
} from "slonik-interceptor-query-logging";
import { env } from "../env.ts";

const global = globalThis as unknown as {
  slonikDbPool: DatabasePool | unknown;
};

export async function getDbPool(): Promise<DatabasePool> {
  if (!global.slonikDbPool) {
    global.slonikDbPool = await createPool(env.DATABASE_URL, {
      driverFactory: createPgDriverFactory(),
      interceptors: [createQueryLoggingInterceptor()],
    });
  }
  return global.slonikDbPool as DatabasePool;
}

export const sql = createSqlTag({
  typeAliases: {
    imageData: z.object({
      id: z.string().uuid(),
      source: z.string(),
      extension: z.string(),
      blurhash: z.string(),
      searchable: z.boolean().optional(),
    }),
    imageDataWithDistance: z.object({
      id: z.string().uuid(),
      source: z.string(),
      extension: z.string(),
      blurhash: z.string(),
      distance: z.number(),
      searchable: z.boolean().optional(),
    }),
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
