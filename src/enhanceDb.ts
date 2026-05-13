import postgres from "postgres";
import { z } from "zod/v4";

type PostgresTypeMap = Record<string, unknown>;

export type PostgresSql<TTypes extends PostgresTypeMap = {}> =
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

type EnhanceableSql<TTypes extends PostgresTypeMap = {}> =
  postgres.ISql<TTypes>;

type QuerySql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Row[]>;

type ScopedSqlMethod = (...args: unknown[]) => Promise<unknown>;

type TopLevelScopedMethodKey = "begin" | "reserve" | "savepoint";
type TopLevelSqlKey =
  | TopLevelScopedMethodKey
  | "CLOSE"
  | "END"
  | "PostgresError"
  | "end"
  | "largeObject"
  | "listen"
  | "notify"
  | "options"
  | "parameters"
  | "subscribe";

type NativeSqlSurface<
  TTypes extends PostgresTypeMap,
  TSql extends EnhanceableSql<TTypes>,
> = TSql extends { release(): void }
  ? postgres.ReservedSql<TTypes>
  : TSql extends { prepare: (...args: never[]) => unknown }
    ? postgres.TransactionSql<TTypes>
    : TSql extends { end: (...args: never[]) => unknown }
      ? postgres.Sql<TTypes>
      : postgres.ISql<TTypes>;

type ExistingNamespaceMethods<TSql> = TSql extends {
  table(tableName: string): infer TReturn;
}
  ? { table(tableName: string): TReturn }
  : object;

type NamespaceMethods = {
  table(tableName: string): postgres.PendingQuery<postgres.Row[]>;
};

type EnhancedTransactionSql<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = postgres.ISql<TTypes> &
  Omit<postgres.TransactionSql<TTypes>, "savepoint"> &
  TExtra &
  EnhancedSqlMethods & {
    savepoint: EnhancedSavepointMethod<TTypes, TExtra>;
  };

type EnhancedReservedSql<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = postgres.ISql<TTypes> &
  Omit<postgres.ReservedSql<TTypes>, TopLevelScopedMethodKey> &
  TExtra &
  EnhancedSqlMethods & {
    begin: EnhancedBeginMethod<TTypes, TExtra>;
    reserve: EnhancedReserveMethod<TTypes, TExtra>;
  };

type EnhancedRootSql<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = postgres.ISql<TTypes> &
  TExtra &
  EnhancedSqlMethods & {
    begin: EnhancedBeginMethod<TTypes, TExtra>;
    reserve: EnhancedReserveMethod<TTypes, TExtra>;
  };

type EnhancedBeginMethod<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = {
  <T>(
    callback: (sql: EnhancedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  <T>(
    options: string,
    callback: (sql: EnhancedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type EnhancedSavepointMethod<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = {
  <T>(
    callback: (sql: EnhancedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  <T>(
    name: string,
    callback: (sql: EnhancedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type EnhancedReserveMethod<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = () => Promise<EnhancedReservedSql<TTypes, TExtra>>;

type EnhancedScopedMethods<
  TTypes extends PostgresTypeMap,
  TSql extends EnhanceableSql<TTypes>,
  TExtra extends object,
> =
  (TSql extends { begin: unknown }
    ? Omit<postgres.Sql<TTypes>, TopLevelScopedMethodKey> & {
        begin: EnhancedBeginMethod<TTypes, TExtra>;
      }
    : object) &
    (TSql extends { savepoint: unknown }
      ? postgres.ISql<TTypes> &
          Omit<postgres.TransactionSql<TTypes>, "savepoint"> & {
          savepoint: EnhancedSavepointMethod<TTypes, TExtra>;
        }
      : object) &
    (TSql extends { reserve: unknown }
      ? { reserve: EnhancedReserveMethod<TTypes, TExtra> }
      : object) &
    (TSql extends { release(): void }
      ? { release(): void }
      : object);

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

export type EnhancedSql<
  TTypes extends PostgresTypeMap = {},
  TSql extends EnhanceableSql<TTypes> = postgres.ISql<TTypes>,
> = postgres.ISql<TTypes> &
  ExistingNamespaceMethods<TSql> &
  EnhancedSqlMethods &
  EnhancedScopedMethods<TTypes, TSql, ExistingNamespaceMethods<TSql>>;

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

function wrapScopedSqlMethod<TTypes extends PostgresTypeMap>(
  method: ScopedSqlMethod,
): ScopedSqlMethod {
  return async (...args: unknown[]) => {
    const callback = args.at(-1);

    if (typeof callback !== "function") {
      return method(...args);
    }

    return method(...args.slice(0, -1), (scopedSql: postgres.ISql<TTypes>) =>
      callback(enhanceDb(scopedSql)),
    );
  };
}

type SqlWithScopedMethods<TTypes extends PostgresTypeMap> =
  postgres.ISql<TTypes> & {
  begin?: ScopedSqlMethod;
  savepoint?: ScopedSqlMethod;
  reserve?: (...args: unknown[]) => Promise<postgres.ISql<TTypes>>;
};

export function enhanceDb<
  TTypes extends PostgresTypeMap = {},
  TSql extends EnhanceableSql<TTypes> = postgres.Sql<TTypes>,
>(
  sql: TSql,
): EnhancedSql<TTypes, TSql> {
  const maybeEnhanced = sql as unknown as EnhancedSql<TTypes, TSql> &
    EnhancedMarker;

  if (maybeEnhanced[ENHANCED_DB]) {
    return maybeEnhanced;
  }

  const query = sql as unknown as QuerySql;
  const runtimeSql = sql as unknown as SqlWithScopedMethods<TTypes>;
  const originalBegin =
    typeof runtimeSql.begin === "function"
      ? runtimeSql.begin.bind(sql)
      : undefined;
  const originalSavepoint =
    typeof runtimeSql.savepoint === "function"
      ? runtimeSql.savepoint.bind(sql)
      : undefined;
  const originalReserve =
    typeof runtimeSql.reserve === "function"
      ? runtimeSql.reserve.bind(sql)
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
  }) as unknown as EnhancedSql<TTypes, TSql> & SqlWithScopedMethods<TTypes>;

  if (originalBegin) {
    enhanced.begin = wrapScopedSqlMethod<TTypes>(originalBegin);
  }

  if (originalSavepoint) {
    enhanced.savepoint = wrapScopedSqlMethod<TTypes>(originalSavepoint);
  }

  if (originalReserve) {
    enhanced.reserve = async (...args: unknown[]) => {
      const reserved = await originalReserve(...args);
      return enhanceDb(
        reserved as postgres.ReservedSql<TTypes>,
      ) as unknown as postgres.ISql<TTypes>;
    };
  }

  Object.defineProperty(enhanced, ENHANCED_DB, {
    value: true,
    enumerable: false,
  });

  return enhanced;
}

export type sql = EnhancedSql;
