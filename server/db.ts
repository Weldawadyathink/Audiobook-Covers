import { createPool, createSqlTag, DatabasePool } from "slonik";
import { createPgDriverFactory } from "./create_pg_driver_factory.ts";
import { z } from "zod";
import { Client } from "pg";
import {
  createQueryLoggingInterceptor,
} from "slonik-interceptor-query-logging";
import { env } from "../env.ts";

let slonik: DatabasePool;
let pool: DatabasePool;

if (env.NODE_ENV !== "build") {
  const slonik = await createPool(env.DATABASE_URL, {
    driverFactory: createPgDriverFactory(),
    interceptors: [createQueryLoggingInterceptor()],
  });
  const pool = slonik;
}
// Do not connect to the database if building
export { pool, slonik };

export const sql = createSqlTag({
  typeAliases: {
    imageData: z.object({
      id: z.string().uuid(),
      source: z.string(),
      extension: z.string(),
      blurhash: z.string(),
    }),
    imageDataWithDistance: z.object({
      id: z.string().uuid(),
      source: z.string(),
      extension: z.string(),
      blurhash: z.string(),
      distance: z.number(),
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
