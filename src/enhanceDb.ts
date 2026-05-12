import postgres from "postgres";
import { z } from "zod/v4";

export type PostgresSql = ReturnType<typeof postgres>;

export type TaggedQuery<T> = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

export type SafeTaggedQuery<T> = TaggedQuery<z.ZodSafeParseResult<T>>;

type Row = Record<string, unknown>;

type PostgresTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Row[]>;

export class NotFoundError extends Error {
  constructor(message = "Query returned no rows.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataIntegrityError";
  }
}

function getFirstColumnValue(row: Row): unknown {
  const entries = Object.entries(row);

  if (entries.length !== 1) {
    throw new DataIntegrityError(
      `Expected exactly one column, got ${entries.length}.`,
    );
  }

  return entries[0]?.[1];
}

export function enhanceDb(sql: PostgresSql) {
  const query = sql as PostgresTag;

  return Object.assign(sql, {
    any<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);
        return arraySchema.parse(rows);
      };
    },

    anySafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);
        return arraySchema.safeParse(rows);
      };
    },

    many<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        return arraySchema.parse(rows);
      };
    },

    manySafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        return arraySchema.safeParse(rows);
      };
    },

    one<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected exactly one row, got ${rows.length}.`,
          );
        }

        return schema.parse(rows[0]);
      };
    },

    oneSafe<T extends z.ZodTypeAny>(schema: T): SafeTaggedQuery<z.output<T>> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected exactly one row, got ${rows.length}.`,
          );
        }

        return schema.safeParse(rows[0]);
      };
    },

    maybeOne<T extends z.ZodTypeAny>(
      schema: T,
    ): TaggedQuery<z.output<T> | null> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          return null;
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected at most one row, got ${rows.length}.`,
          );
        }

        return schema.parse(rows[0]);
      };
    },

    maybeOneSafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T> | null> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          return z.null().safeParse(null);
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected at most one row, got ${rows.length}.`,
          );
        }

        return schema.safeParse(rows[0]);
      };
    },

    anyFirst<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);
        return arraySchema.parse(rows.map(getFirstColumnValue));
      };
    },

    anyFirstSafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);
        return arraySchema.safeParse(rows.map(getFirstColumnValue));
      };
    },

    manyFirst<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        return arraySchema.parse(rows.map(getFirstColumnValue));
      };
    },

    manyFirstSafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        return arraySchema.safeParse(rows.map(getFirstColumnValue));
      };
    },

    oneFirst<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected exactly one row, got ${rows.length}.`,
          );
        }

        return schema.parse(getFirstColumnValue(rows[0]));
      };
    },

    oneFirstSafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T>> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          throw new NotFoundError();
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected exactly one row, got ${rows.length}.`,
          );
        }

        return schema.safeParse(getFirstColumnValue(rows[0]));
      };
    },

    maybeOneFirst<T extends z.ZodTypeAny>(
      schema: T,
    ): TaggedQuery<z.output<T> | null> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          return null;
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected at most one row, got ${rows.length}.`,
          );
        }

        return schema.parse(getFirstColumnValue(rows[0]));
      };
    },

    maybeOneFirstSafe<T extends z.ZodTypeAny>(
      schema: T,
    ): SafeTaggedQuery<z.output<T> | null> {
      return async (strings, ...values) => {
        const rows = await query(strings, ...values);

        if (rows.length === 0) {
          return z.null().safeParse(null);
        }

        if (rows.length > 1) {
          throw new DataIntegrityError(
            `Expected at most one row, got ${rows.length}.`,
          );
        }

        return schema.safeParse(getFirstColumnValue(rows[0]));
      };
    },

    async exists(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<boolean> {
      const rows = await query(strings, ...values);
      return rows.length > 0;
    },
  });
}
