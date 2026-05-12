import postgres from "postgres";
import { z } from "zod/v4";

export type PostgresSql = ReturnType<typeof postgres>;

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

type EnhanceableSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Row[]>;

type ScopedSqlMethod = (...args: unknown[]) => Promise<unknown>;

type EnhanceableTransactionSql = EnhanceableSql & {
  savepoint: ScopedSqlMethod;
};

type EnhanceableReservedSql = EnhanceableSql & {
  begin: ScopedSqlMethod;
  reserve: () => Promise<EnhanceableSql>;
  release(): void;
};

type EnhancedTransactionSql = EnhancedSql<EnhanceableTransactionSql>;
type EnhancedReservedSql = EnhancedSql<EnhanceableReservedSql>;

type EnhancedBeginMethod = {
  <T>(callback: (sql: EnhancedTransactionSql) => T | Promise<T>): Promise<
    Awaited<T>
  >;
  <T>(
    options: string,
    callback: (sql: EnhancedTransactionSql) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type EnhancedSavepointMethod = {
  <T>(callback: (sql: EnhancedTransactionSql) => T | Promise<T>): Promise<
    Awaited<T>
  >;
  <T>(
    name: string,
    callback: (sql: EnhancedTransactionSql) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type EnhancedReserveMethod = () => Promise<EnhancedReservedSql>;

type EnhancedScopedMethods<TSql extends EnhanceableSql> =
  (TSql extends { begin: (...args: never[]) => unknown }
    ? { begin: EnhancedBeginMethod }
    : object) &
    (TSql extends { savepoint: (...args: never[]) => unknown }
      ? { savepoint: EnhancedSavepointMethod }
      : object) &
    (TSql extends { reserve: (...args: never[]) => unknown }
      ? { reserve: EnhancedReserveMethod }
      : object);

type EnhancedSqlMethods = {
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

export type EnhancedSql<TSql extends EnhanceableSql = EnhanceableSql> = TSql &
  EnhancedSqlMethods &
  EnhancedScopedMethods<TSql>;

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

function wrapScopedSqlMethod(method: ScopedSqlMethod): ScopedSqlMethod {
  return async (...args: unknown[]) => {
    const callback = args.at(-1);

    if (typeof callback !== "function") {
      return method(...args);
    }

    return method(...args.slice(0, -1), (scopedSql: EnhanceableSql) =>
      callback(enhanceDb(scopedSql)),
    );
  };
}

type SqlWithScopedMethods = EnhanceableSql & {
  begin?: ScopedSqlMethod;
  savepoint?: ScopedSqlMethod;
  reserve?: (...args: unknown[]) => Promise<EnhanceableSql>;
};

export function enhanceDb<TSql extends EnhanceableSql>(
  sql: TSql,
): EnhancedSql<TSql> {
  const maybeEnhanced = sql as EnhancedSql<TSql> & EnhancedMarker;

  if (maybeEnhanced[ENHANCED_DB]) {
    return maybeEnhanced;
  }

  const query = sql;
  const originalBegin =
    "begin" in sql && typeof sql.begin === "function"
      ? sql.begin.bind(sql)
      : undefined;
  const originalSavepoint =
    "savepoint" in sql && typeof sql.savepoint === "function"
      ? sql.savepoint.bind(sql)
      : undefined;
  const originalReserve =
    "reserve" in sql && typeof sql.reserve === "function"
      ? sql.reserve.bind(sql)
      : undefined;

  const enhanced = Object.assign(sql, {
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
  }) as EnhancedSql<TSql> & SqlWithScopedMethods;

  if (originalBegin) {
    enhanced.begin = wrapScopedSqlMethod(originalBegin);
  }

  if (originalSavepoint) {
    enhanced.savepoint = wrapScopedSqlMethod(originalSavepoint);
  }

  if (originalReserve) {
    enhanced.reserve = async (...args: unknown[]) => {
      const reserved = await originalReserve(...args);
      return enhanceDb(reserved);
    };
  }

  Object.defineProperty(enhanced, ENHANCED_DB, {
    value: true,
    enumerable: false,
  });

  return enhanced;
}

export type sql = ReturnType<typeof enhanceDb<PostgresSql>>;
