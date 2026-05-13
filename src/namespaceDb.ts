import type postgres from "postgres";

export type PostgresSql = ReturnType<typeof postgres>;

const NAMESPACED_DB = Symbol("NAMESPACED_DB");

type NamespaceMarker = {
  [NAMESPACED_DB]?: string;
};

type SqlTag = {
  <T extends readonly (object | undefined)[] = postgres.Row[]>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): postgres.PendingQuery<T>;
  (identifier: string): postgres.Helper<string, []>;
};

type ScopedSqlMethod = (...args: unknown[]) => Promise<unknown>;

type NamespaceSqlMethods = {
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

type ScopedSqlBase<TSql extends SqlTag, TScoped extends SqlTag> = Omit<
  TSql,
  TopLevelSqlKey
> &
  TScoped;

type NamespacedTransactionSql<TSql extends SqlTag> = NamespacedSql<
  ScopedSqlBase<
    TSql,
    SqlTag & {
      savepoint: ScopedSqlMethod;
    }
  >
>;

type NamespacedReservedSql<TSql extends SqlTag> = NamespacedSql<
  ScopedSqlBase<
    TSql,
    SqlTag & {
      begin: ScopedSqlMethod;
      reserve: () => Promise<SqlTag>;
      release(): void;
    }
  >
>;

type NamespacedBeginMethod<TSql extends SqlTag> = {
  <T>(
    callback: (sql: NamespacedTransactionSql<TSql>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  <T>(
    options: string,
    callback: (sql: NamespacedTransactionSql<TSql>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type NamespacedSavepointMethod<TSql extends SqlTag> = {
  <T>(
    callback: (sql: NamespacedTransactionSql<TSql>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  <T>(
    name: string,
    callback: (sql: NamespacedTransactionSql<TSql>) => T | Promise<T>,
  ): Promise<Awaited<T>>;
};

type NamespacedReserveMethod<TSql extends SqlTag> = () => Promise<
  NamespacedReservedSql<TSql>
>;

type NamespacedScopedMethods<TSql extends SqlTag> =
  (TSql extends { begin: (...args: never[]) => unknown }
    ? { begin: NamespacedBeginMethod<TSql> }
    : object) &
    (TSql extends { savepoint: (...args: never[]) => unknown }
      ? { savepoint: NamespacedSavepointMethod<TSql> }
      : object) &
    (TSql extends { reserve: (...args: never[]) => unknown }
      ? { reserve: NamespacedReserveMethod<TSql> }
      : object);

export type NamespacedSql<TSql extends SqlTag = SqlTag> =
  SqlTag &
  Omit<TSql, TopLevelScopedMethodKey> &
  NamespaceSqlMethods &
  NamespacedScopedMethods<TSql>;

function wrapScopedSqlMethod(
  schemaName: string,
  method: ScopedSqlMethod,
): ScopedSqlMethod {
  return async (...args: unknown[]) => {
    const callback = args.at(-1);

    if (typeof callback !== "function") {
      return method(...args);
    }

    return method(...args.slice(0, -1), (scopedSql: SqlTag) =>
      callback(namespaceDb(scopedSql, schemaName)),
    );
  };
}

type SqlWithScopedMethods = SqlTag & {
  begin?: ScopedSqlMethod;
  savepoint?: ScopedSqlMethod;
  reserve?: (...args: unknown[]) => Promise<SqlTag>;
};

export function namespaceDb<TSql extends SqlTag>(
  sql: TSql,
  schemaName: string,
): NamespacedSql<TSql> {
  const maybeNamespaced = sql as unknown as NamespacedSql<TSql> &
    NamespaceMarker;

  if (maybeNamespaced[NAMESPACED_DB]) {
    if (maybeNamespaced[NAMESPACED_DB] !== schemaName) {
      throw new Error(
        `SQL tag is already namespaced with "${maybeNamespaced[NAMESPACED_DB]}".`,
      );
    }

    return maybeNamespaced;
  }

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
  const query = sql;

  const enhanced = Object.assign(sql, {
    table(tableName: string): postgres.PendingQuery<postgres.Row[]> {
      return query`${query(schemaName)}.${query(tableName)}`;
    },
  }) as unknown as NamespacedSql<TSql> & SqlWithScopedMethods;

  if (originalBegin) {
    enhanced.begin = wrapScopedSqlMethod(schemaName, originalBegin);
  }

  if (originalSavepoint) {
    enhanced.savepoint = wrapScopedSqlMethod(schemaName, originalSavepoint);
  }

  if (originalReserve) {
    enhanced.reserve = async (...args: unknown[]) => {
      const reserved = await originalReserve(...args);
      return namespaceDb(reserved, schemaName);
    };
  }

  Object.defineProperty(enhanced, NAMESPACED_DB, {
    value: schemaName,
    enumerable: false,
  });

  return enhanced;
}
