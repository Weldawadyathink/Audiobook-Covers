import { createPool, createSqlTag } from "slonik";
import { createPgDriverFactory } from "./create_pg_driver_factory.ts";
import { z } from "zod";
import { Client } from "pg";
import {
  createQueryLoggingInterceptor,
} from "slonik-interceptor-query-logging";

const dbUrl = Deno.env.get("DATABASE_URL");
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable not set!");
}

export const pool = await createPool(dbUrl, {
  driverFactory: createPgDriverFactory(),
  interceptors: [createQueryLoggingInterceptor()],
});

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
  },
});

if (import.meta.main) {
  const client = new Client({
    connectionString: Deno.env.get("DATABASE_URL"),
    ssl: true,
  });
  console.log("Created database");
  await client.connect();
  console.log("Connected to database");
  console.log((await client.query("SELECT version();")).rows[0].version);
  await client.end();
}
