import { createPool, createSqlTag, DatabasePool } from "slonik";
import { createPgDriverFactory } from "@slonik/pg-driver";
import { z } from "zod/v4";
import { createQueryLoggingInterceptor } from "slonik-interceptor-query-logging";
import { getEnv } from "@/server/env";

const global = globalThis as unknown as {
  slonikDbPool: DatabasePool | undefined;
};

export async function getDbPool(): Promise<DatabasePool> {
  if (!global.slonikDbPool) {
    console.log("Creating database pool");
    global.slonikDbPool = await createPool(getEnv().DATABASE_URL, {
      driverFactory: createPgDriverFactory(),
      interceptors: [createQueryLoggingInterceptor()],
      maximumPoolSize: 2,
    });
  }
  return global.slonikDbPool;
}

export const sql = createSqlTag({
  typeAliases: {
    void: z.object({}).strict(),
  },
});
