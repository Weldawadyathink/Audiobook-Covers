import type postgres from "postgres";

export type PostgresSql<TTypes extends Record<string, unknown> = {}> =
  postgres.Sql<TTypes>;

const NAMESPACED_DB = Symbol("NAMESPACED_DB");

type NamespaceMarker = {
  [NAMESPACED_DB]?: string;
};

export type NamespaceSqlMethods = {
  table(tableName: string): postgres.PendingQuery<postgres.Row[]>;
};

export type NamespacedSql<TSql extends postgres.ISql = postgres.Sql> = TSql &
  NamespaceSqlMethods;

export function namespaceDb<TSql extends postgres.ISql>(
  sql: TSql,
  schemaName: string,
): NamespacedSql<TSql> {
  const maybeNamespaced = sql as NamespacedSql<TSql> & NamespaceMarker;

  if (maybeNamespaced[NAMESPACED_DB]) {
    if (maybeNamespaced[NAMESPACED_DB] !== schemaName) {
      throw new Error(
        `SQL tag is already namespaced with "${maybeNamespaced[NAMESPACED_DB]}".`,
      );
    }

    return maybeNamespaced;
  }

  const helpers: NamespaceSqlMethods = {
    table(tableName) {
      return sql`${sql(schemaName)}.${sql(tableName)}`;
    },
  };

  return new Proxy(sql, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args);
    },

    get(target, prop, receiver) {
      if (prop === NAMESPACED_DB) {
        return schemaName;
      }

      if (prop in helpers) {
        return helpers[prop as keyof NamespaceSqlMethods];
      }

      return Reflect.get(target, prop, receiver);
    },
  }) as NamespacedSql<TSql>;
}
