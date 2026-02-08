import {
  createPool,
  createSqlTag,
  DatabasePool,
  type DatabaseTransactionConnection,
} from "slonik";
import { createPgDriverFactory } from "@slonik/pg-driver";
import { z } from "zod/v4";
import { createQueryLoggingInterceptor } from "slonik-interceptor-query-logging";
import { getEnv } from "@/server/env";

export const sql = createSqlTag({
  typeAliases: {
    void: z.object({}).strict(),
  },
});

const global = globalThis as unknown as {
  slonikDbPool: DatabasePool | undefined;
};

async function getDbPool(): Promise<DatabasePool> {
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

async function setContext(trx: DatabaseTransactionConnection): Promise<void> {
  if (getEnv().APP_STAGE === "local" || getEnv().APP_STAGE === "development") {
    await trx.query(sql.unsafe`SET LOCAL ROLE audiobookcovers_dev`);
  }
  if (getEnv().APP_STAGE === "production") {
    await trx.query(sql.unsafe`SET LOCAL ROLE audiobookcovers`);
  }
}

/**
 * Runs the given handler inside a transaction with role context set (e.g. SET LOCAL ROLE).
 * Use the passed `trx` for all queries in that transaction; it has the same API as the pool
 * (query, one, oneFirst, any, many, maybeOne, etc.). The transaction commits when the
 * handler resolves, or rolls back if it throws.
 */
export async function dbTransaction<T>(
  handler: (trx: DatabaseTransactionConnection) => Promise<T>,
  transactionRetryLimit?: number,
): Promise<T> {
  const pool = await getDbPool();
  return pool.transaction(async (trx) => {
    await setContext(trx);
    return handler(trx);
  }, transactionRetryLimit);
}
