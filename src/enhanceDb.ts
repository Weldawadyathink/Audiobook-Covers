import type postgres from "postgres";
import { z } from "zod/v4";

export type PostgresSql<TTypes extends Record<string, unknown> = {}> =
  postgres.Sql<TTypes>;

const ENHANCED_DB = Symbol("ENHANCED_DB");

type EnhancedMarker = {
  [ENHANCED_DB]?: true;
};

export type TaggedQuery<T> = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

export type SafeTaggedQuery<T> = TaggedQuery<z.ZodSafeParseResult<T>>;

type Row = Record<string, unknown>;

type QuerySql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Row[]>;

export type EnhancedSqlMethods = {
  any<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]>;
  anySafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T>[]>;
  many<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]>;
  manySafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T>[]>;
  one<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>>;
  oneSafe<T extends z.ZodTypeAny>(schema: T): SafeTaggedQuery<z.output<T>>;
  maybeOne<T extends z.ZodTypeAny>(
    schema: T,
  ): TaggedQuery<z.output<T> | null>;
  maybeOneSafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T> | null>;
  anyFirst<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]>;
  anyFirstSafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T>[]>;
  manyFirst<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]>;
  manyFirstSafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T>[]>;
  oneFirst<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>>;
  oneFirstSafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T>>;
  maybeOneFirst<T extends z.ZodTypeAny>(
    schema: T,
  ): TaggedQuery<z.output<T> | null>;
  maybeOneFirstSafe<T extends z.ZodTypeAny>(
    schema: T,
  ): SafeTaggedQuery<z.output<T> | null>;
  exists(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<boolean>;
};

export type EnhancedSql<TSql extends postgres.ISql = postgres.Sql> = TSql &
  EnhancedSqlMethods;

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

function createHelpers(query: QuerySql): EnhancedSqlMethods {
  return {
    any<T extends z.ZodTypeAny>(schema: T): TaggedQuery<z.output<T>[]> {
      const arraySchema = z.array(schema);

      return async (strings, ...values) => {
        const rows = await query(strings, ...values);
        return arraySchema.parse(rows);
      };
    },

    anySafe<T extends z.ZodTypeAny>(schema: T): SafeTaggedQuery<z.output<T>[]> {
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
  };
}

export function enhanceDb<TSql extends postgres.ISql>(
  sql: TSql,
): EnhancedSql<TSql> {
  const maybeEnhanced = sql as EnhancedSql<TSql> & EnhancedMarker;

  if (maybeEnhanced[ENHANCED_DB]) {
    return maybeEnhanced;
  }

  const helpers = createHelpers(sql as unknown as QuerySql);

  return new Proxy(sql, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args);
    },

    get(target, prop, receiver) {
      if (prop === ENHANCED_DB) {
        return true;
      }

      if (prop in helpers) {
        return helpers[prop as keyof EnhancedSqlMethods];
      }

      return Reflect.get(target, prop, receiver);
    },
  }) as EnhancedSql<TSql>;
}

export type sql = EnhancedSql;
