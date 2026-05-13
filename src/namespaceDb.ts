import type postgres from "postgres";
import type { EnhancedSqlMethods } from "./enhanceDb";

type PostgresTypeMap = Record<string, unknown>;

export type PostgresSql<TTypes extends PostgresTypeMap = {}> =
  postgres.Sql<TTypes>;

const NAMESPACED_DB = Symbol("NAMESPACED_DB");

type NamespaceMarker = {
  [NAMESPACED_DB]?: string;
};

type EnhanceableSql<TTypes extends PostgresTypeMap = {}> =
  postgres.ISql<TTypes>;

type ScopedSqlMethod = (...args: unknown[]) => Promise<unknown>;

export type NamespaceSqlMethods = {
  table(tableName: string): postgres.PendingQuery<postgres.Row[]>;
};

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

type ExistingEnhancedMethods<TSql> = TSql extends {
  one: EnhancedSqlMethods["one"];
}
  ? EnhancedSqlMethods
  : object;

type NamespacedTransactionSql<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = postgres.ISql<TTypes> &
  Omit<postgres.TransactionSql<TTypes>, "savepoint"> &
  TExtra &
  NamespaceSqlMethods & {
    savepoint: NamespacedSavepointMethod<TTypes, TExtra>;
  };

type NamespacedReservedSql<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = postgres.ISql<TTypes> &
  Omit<postgres.ReservedSql<TTypes>, TopLevelScopedMethodKey> &
  TExtra &
  NamespaceSqlMethods & {
    begin: NamespacedBeginMethod<TTypes, TExtra>;
    reserve: NamespacedReserveMethod<TTypes, TExtra>;
  };

type NamespacedBeginMethod<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = {
  <T>(
    callback: (sql: NamespacedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  <T>(
    options: string,
    callback: (sql: NamespacedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type NamespacedSavepointMethod<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = {
  <T>(
    callback: (sql: NamespacedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  <T>(
    name: string,
    callback: (sql: NamespacedTransactionSql<TTypes, TExtra>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type NamespacedReserveMethod<
  TTypes extends PostgresTypeMap,
  TExtra extends object,
> = () => Promise<NamespacedReservedSql<TTypes, TExtra>>;

type NamespacedScopedMethods<
  TTypes extends PostgresTypeMap,
  TSql extends EnhanceableSql<TTypes>,
  TExtra extends object,
> =
  (TSql extends { begin: unknown }
    ? Omit<postgres.Sql<TTypes>, TopLevelScopedMethodKey> & {
        begin: NamespacedBeginMethod<TTypes, TExtra>;
      }
    : object) &
    (TSql extends { savepoint: unknown }
      ? postgres.ISql<TTypes> &
          Omit<postgres.TransactionSql<TTypes>, "savepoint"> & {
          savepoint: NamespacedSavepointMethod<TTypes, TExtra>;
        }
      : object) &
    (TSql extends { reserve: unknown }
      ? { reserve: NamespacedReserveMethod<TTypes, TExtra> }
      : object) &
    (TSql extends { release(): void }
      ? { release(): void }
      : object);

export type NamespacedSql<
  TTypes extends PostgresTypeMap = {},
  TSql extends EnhanceableSql<TTypes> = postgres.ISql<TTypes>,
> = postgres.ISql<TTypes> &
  ExistingEnhancedMethods<TSql> &
  NamespaceSqlMethods &
  NamespacedScopedMethods<TTypes, TSql, ExistingEnhancedMethods<TSql>>;

function wrapScopedSqlMethod<TTypes extends PostgresTypeMap>(
  schemaName: string,
  method: ScopedSqlMethod,
): ScopedSqlMethod {
  return async (...args: unknown[]) => {
    const callback = args.at(-1);

    if (typeof callback !== "function") {
      return method(...args);
    }

    return method(...args.slice(0, -1), (scopedSql: postgres.ISql<TTypes>) =>
      callback(namespaceDb(scopedSql, schemaName)),
    );
  };
}

type SqlWithScopedMethods<TTypes extends PostgresTypeMap> =
  postgres.ISql<TTypes> & {
  begin?: ScopedSqlMethod;
  savepoint?: ScopedSqlMethod;
  reserve?: (...args: unknown[]) => Promise<postgres.ISql<TTypes>>;
};

export function namespaceDb<
  TTypes extends PostgresTypeMap = {},
  TSql extends EnhanceableSql<TTypes> = postgres.Sql<TTypes>,
>(
  sql: TSql,
  schemaName: string,
): NamespacedSql<TTypes, TSql> {
  const maybeNamespaced = sql as unknown as NamespacedSql<TTypes, TSql> &
    NamespaceMarker;

  if (maybeNamespaced[NAMESPACED_DB]) {
    if (maybeNamespaced[NAMESPACED_DB] !== schemaName) {
      throw new Error(
        `SQL tag is already namespaced with "${maybeNamespaced[NAMESPACED_DB]}".`,
      );
    }

    return maybeNamespaced;
  }

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
  const query = sql;

  const enhanced = Object.assign(sql, {
    table(tableName: string): postgres.PendingQuery<postgres.Row[]> {
      return query`${query(schemaName)}.${query(tableName)}`;
    },
  }) as unknown as NamespacedSql<TTypes, TSql> & SqlWithScopedMethods<TTypes>;

  if (originalBegin) {
    enhanced.begin = wrapScopedSqlMethod<TTypes>(schemaName, originalBegin);
  }

  if (originalSavepoint) {
    enhanced.savepoint = wrapScopedSqlMethod<TTypes>(
      schemaName,
      originalSavepoint,
    );
  }

  if (originalReserve) {
    enhanced.reserve = async (...args: unknown[]) => {
      const reserved = await originalReserve(...args);
      return namespaceDb<TTypes, postgres.ReservedSql<TTypes>>(
        reserved as postgres.ReservedSql<TTypes>,
        schemaName,
      ) as unknown as postgres.ISql<TTypes>;
    };
  }

  Object.defineProperty(enhanced, NAMESPACED_DB, {
    value: schemaName,
    enumerable: false,
  });

  return enhanced;
}
