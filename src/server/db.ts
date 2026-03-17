import postgres from "postgres";
import { z } from "zod/v4";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";

type TaggedQuery<T> = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

type Row = Record<string, unknown>;

type PostgresTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Row[]>;

export function getDbWriteConnection() {
  // Connect to the primary database for writes.
  logger.info("Creating new db write connection");
  const sql = postgres(getEnv().DATABASE_WRITE_URL, {
    max: 2,
    fetch_types: false,
    prepare: true,
  });
  const sqlTools = getSqlTools(sql);
  return { sql, sqlTools };
}

export function getDbReadConnection() {
  // Connect to the read only replica database.
  // This is used for reads that don't need to be consistent.
  logger.info("Creating new db read connection");
  const sql = postgres(getEnv().DATABASE_READ_URL, {
    max: 2,
    fetch_types: false,
    prepare: true,
  });
  const sqlTools = getSqlTools(sql);
  return { sql, sqlTools };
}

function getSqlTools(sql: ReturnType<typeof postgres>) {
  return {
    /** One or more rows; validated as array of T. */
    many<T extends z.ZodTypeAny>(validator: T): TaggedQuery<z.infer<T>[]> {
      const arrayValidator = z.array(validator);
      return async (strings, ...values) => {
        const rows = await (sql as PostgresTag)(strings, ...values);
        return arrayValidator.parse(rows) as z.infer<T>[];
      };
    },

    /** Exactly one row; throws if 0 or >1. */
    one<T extends z.ZodTypeAny>(validator: T): TaggedQuery<z.infer<T>> {
      return async (strings, ...values) => {
        const rows = await (sql as PostgresTag)(strings, ...values);
        if (rows.length === 0) {
          throw new Error("Expected one row, got zero.");
        }
        if (rows.length > 1) {
          throw new Error(`Expected one row, got ${rows.length}.`);
        }
        return validator.parse(rows[0]) as z.infer<T>;
      };
    },

    /** Zero or one row; returns null if 0. */
    maybeOne<T extends z.ZodTypeAny>(
      validator: T,
    ): TaggedQuery<z.infer<T> | null> {
      return async (strings, ...values) => {
        const rows = await (sql as PostgresTag)(strings, ...values);
        if (rows.length === 0) return null;
        if (rows.length > 1) {
          throw new Error(`Expected at most one row, got ${rows.length}.`);
        }
        return validator.parse(rows[0]) as z.infer<T>;
      };
    },

    /** Zero or more rows; same as many. */
    any<T extends z.ZodTypeAny>(validator: T): TaggedQuery<z.infer<T>[]> {
      const arrayValidator = z.array(validator);
      return async (strings, ...values) => {
        const rows = await (sql as PostgresTag)(strings, ...values);
        return arrayValidator.parse(rows) as z.infer<T>[];
      };
    },

    /** Exactly one row; return first column value only. */
    oneFirst<T extends z.ZodTypeAny>(validator: T): TaggedQuery<z.infer<T>> {
      return async (strings, ...values) => {
        const rows = await (sql as PostgresTag)(strings, ...values);
        if (rows.length === 0) {
          throw new Error("Expected one row, got zero.");
        }
        if (rows.length > 1) {
          throw new Error(`Expected one row, got ${rows.length}.`);
        }
        return validator.parse(rows[0]) as z.infer<T>;
      };
    },

    /** For now, same as unsafe. Just provides a better understanding of the goal. */
    /** query is for updates/inserts, unsafe is for non-verified reads */
    query: (async (strings: TemplateStringsArray, ...values: unknown[]) =>
      (sql as PostgresTag)(strings, ...values)) as TaggedQuery<Row[]>,

    /** Execute without validation; returns raw rows. */
    unsafe: (async (strings: TemplateStringsArray, ...values: unknown[]) =>
      (sql as PostgresTag)(strings, ...values)) as TaggedQuery<Row[]>,
  };
}
