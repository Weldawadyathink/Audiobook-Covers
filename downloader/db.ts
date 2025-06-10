import { createPool, createSqlTag } from "slonik";
import { createPgDriverFactory } from "./create_pg_driver_factory.ts";
import { z } from "zod";
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
    redditId: z.object({
      redditId: z.string().min(6).max(7),
    }),
  },
});
