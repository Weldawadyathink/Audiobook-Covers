import rawSql from "./sql/raw.sql?raw";
import authorsNormalizedSql from "./sql/authors_normalized.sql?raw";
import editionsNormalizedSql from "./sql/editions_normalized.sql?raw";
import redirectsNormalizedSql from "./sql/redirects_normalized.sql?raw";
import worksNormalizedSql from "./sql/works_normalized.sql?raw";
import workAuthorLinksSql from "./sql/work_author_links.sql?raw";
import workAuthorAggregatesSql from "./sql/work_author_aggregates.sql?raw";
import editionAggregatesSql from "./sql/edition_aggregates.sql?raw";
import worksSearchSql from "./sql/works_search.sql?raw";
import worksForPostgresSql from "./sql/works_for_postgres.sql?raw";
import worksSearchReadySql from "./sql/works_search_ready.sql?raw";

type QueryDefinition = {
  readonly name: string;
  readonly query: string;
  readonly requires?: readonly string[];
  /**
   * Whether this query creates a BigQuery table named after itself. Defaults to
   * true — every query here follows that convention, which is what lets the ETL
   * derive its cleanup list from the DAG instead of a hand-maintained list.
   */
  readonly producesTable?: boolean;
};

type QueryName<TQuery extends QueryDefinition> = TQuery["name"];

type QueryNames<TQueries extends readonly QueryDefinition[]> =
  TQueries[number]["name"];

type QueryByName<
  TQueries extends readonly QueryDefinition[],
  TName extends QueryNames<TQueries>,
> = Extract<TQueries[number], { readonly name: TName }>;

type QueryRequires<TQuery extends QueryDefinition> =
  TQuery["requires"] extends readonly string[]
    ? TQuery["requires"][number]
    : never;

type MissingRequires<
  TQueries extends readonly QueryDefinition[],
  TQuery extends QueryDefinition,
> = Exclude<QueryRequires<TQuery>, QueryNames<TQueries>>;

type SelfRequires<TQuery extends QueryDefinition> = Extract<
  QueryRequires<TQuery>,
  QueryName<TQuery>
>;

type DuplicateNames<
  TQueries extends readonly QueryDefinition[],
  TSeen extends string = never,
> = TQueries extends readonly [
  infer THead extends QueryDefinition,
  ...infer TTail extends readonly QueryDefinition[],
]
  ? QueryName<THead> extends TSeen
    ? QueryName<THead> | DuplicateNames<TTail, TSeen>
    : DuplicateNames<TTail, TSeen | QueryName<THead>>
  : never;

type MissingDependencyErrors<TQueries extends readonly QueryDefinition[]> = {
  [TIndex in keyof TQueries]: TQueries[TIndex] extends infer TQuery extends
    QueryDefinition
    ? MissingRequires<TQueries, TQuery> extends infer TMissing extends string
      ? [TMissing] extends [never]
        ? never
        : `Query "${QueryName<TQuery>}" requires unknown query "${TMissing}"`
      : never
    : never;
}[number];

type SelfDependencyErrors<TQueries extends readonly QueryDefinition[]> = {
  [TIndex in keyof TQueries]: TQueries[TIndex] extends infer TQuery extends
    QueryDefinition
    ? SelfRequires<TQuery> extends infer TSelf extends string
      ? [TSelf] extends [never]
        ? never
        : `Query "${QueryName<TQuery>}" cannot require itself`
      : never
    : never;
}[number];

type DuplicateNameErrors<TQueries extends readonly QueryDefinition[]> =
  DuplicateNames<TQueries> extends infer TDuplicate extends string
    ? [TDuplicate] extends [never]
      ? never
      : `Duplicate query name "${TDuplicate}"`
    : never;

type HasDependencyCycle<
  TQueries extends readonly QueryDefinition[],
  TName extends QueryNames<TQueries>,
  TPath extends string = never,
> = TName extends TPath
  ? true
  : HasDependencyCycleInNames<
      TQueries,
      QueryRequires<QueryByName<TQueries, TName>>,
      TPath | TName
    >;

type HasDependencyCycleInNames<
  TQueries extends readonly QueryDefinition[],
  TNames extends string,
  TPath extends string,
> = [TNames] extends [never]
  ? false
  : Extract<
        {
          [TName in Extract<TNames, QueryNames<TQueries>>]: HasDependencyCycle<
            TQueries,
            TName,
            TPath
          >;
        }[Extract<TNames, QueryNames<TQueries>>],
        true
      > extends never
    ? false
    : true;

type CyclicDependencyErrors<TQueries extends readonly QueryDefinition[]> = {
  [TIndex in keyof TQueries]: TQueries[TIndex] extends infer TQuery extends
    QueryDefinition
    ? HasDependencyCycle<TQueries, QueryName<TQuery>> extends true
      ? `Query "${QueryName<TQuery>}" is part of a dependency cycle`
      : never
    : never;
}[number];

type QueryDependencyErrors<TQueries extends readonly QueryDefinition[]> =
  | DuplicateNameErrors<TQueries>
  | MissingDependencyErrors<TQueries>
  | SelfDependencyErrors<TQueries>
  | CyclicDependencyErrors<TQueries>;

type AssertValidQueries<TQueries extends readonly QueryDefinition[]> =
  QueryDependencyErrors<TQueries> extends never
    ? TQueries
    : TQueries & {
        readonly __query_dependency_errors__: QueryDependencyErrors<TQueries>;
      };

export function defineQueries<
  const TQueries extends readonly QueryDefinition[],
>(queries: AssertValidQueries<TQueries>) {
  return queries;
}

export const queries = defineQueries([
  {
    name: "raw",
    query: rawSql,
  },
  {
    name: "authors_normalized",
    requires: ["raw"],
    query: authorsNormalizedSql,
  },
  {
    name: "editions_normalized",
    requires: ["raw"],
    query: editionsNormalizedSql,
  },
  {
    name: "redirects_normalized",
    requires: ["raw"],
    query: redirectsNormalizedSql,
  },
  {
    name: "works_normalized",
    requires: ["raw"],
    query: worksNormalizedSql,
  },
  {
    name: "work_author_links",
    requires: ["works_normalized"],
    query: workAuthorLinksSql,
  },
  {
    name: "work_author_aggregates",
    requires: ["work_author_links", "authors_normalized"],
    query: workAuthorAggregatesSql,
  },
  {
    name: "edition_aggregates",
    requires: ["editions_normalized"],
    query: editionAggregatesSql,
  },
  {
    name: "works_search",
    requires: [
      "works_normalized",
      "edition_aggregates",
      "work_author_aggregates",
    ],
    query: worksSearchSql,
  },
  {
    name: "works_for_postgres",
    requires: ["works_search"],
    query: worksForPostgresSql,
  },
  {
    name: "works_search_ready",
    // End target. Make all desired tables required by this target.
    requires: ["works_for_postgres"],
    query: worksSearchReadySql,
    producesTable: false,
  },
]);

/**
 * Tables built on the way to `target`, in dependency order.
 *
 * These are pure intermediates: every one is rebuilt from scratch by the next
 * run (`LOAD DATA OVERWRITE` / `CREATE OR REPLACE TABLE`), so keeping them
 * between runs buys nothing and bills active storage on hundreds of GB. The ETL
 * drops them once a run succeeds.
 *
 * The Postgres checkpoint table is deliberately not derivable here — it is not a
 * query name, so it can never end up in this list.
 */
export function getProcessingTableNames<
  const TQueries extends readonly QueryDefinition[],
  const TTarget extends QueryNames<TQueries>,
>(queries: TQueries, target: TTarget): string[] {
  return [...getQueryForTarget(queries, target)]
    .flat()
    .filter((query) => query.producesTable !== false)
    .map((query) => query.name);
}

/**
 * Substitutes `${name}` placeholders in a .sql file with concrete values.
 *
 * BigQuery query parameters (`@name`) cannot appear in DDL positions such as
 * table names or `FROM FILES` URIs, so those have to be textually substituted.
 * Throws on an unknown placeholder so a typo fails loudly instead of shipping a
 * literal `${typo}` to BigQuery.
 */
export function renderSql(
  sql: string,
  variables: Record<string, string>,
): string {
  return sql.replace(/\$\{(\w+)\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      throw new Error(`Unknown SQL placeholder \${${name}} in query`);
    }
    return value;
  });
}

function buildQueryMap<const TQueries extends readonly QueryDefinition[]>(
  queries: TQueries,
) {
  return new Map<QueryNames<TQueries>, TQueries[number]>(
    queries.map((query) => [query.name, query]),
  );
}

export function isQueryName<const TQueries extends readonly QueryDefinition[]>(
  queries: TQueries,
  value: string,
): value is QueryNames<TQueries> {
  return buildQueryMap(queries).has(value as QueryNames<TQueries>);
}

function getRequires<const TQueries extends readonly QueryDefinition[]>(
  query: TQueries[number],
): readonly QueryNames<TQueries>[] {
  return (query.requires ?? []) as readonly QueryNames<TQueries>[];
}

function getRequiredQueryNames<
  const TQueries extends readonly QueryDefinition[],
>(queries: TQueries, target: QueryNames<TQueries>) {
  const queriesByName = buildQueryMap(queries);
  const requiredNames = new Set<QueryNames<TQueries>>();
  const stack: QueryNames<TQueries>[] = [target];

  while (stack.length > 0) {
    const name = stack.pop();

    if (!name || requiredNames.has(name)) continue;

    const query = queriesByName.get(name);

    if (!query) {
      throw new Error(`Unknown query "${name}"`);
    }

    requiredNames.add(name);

    for (const dependency of getRequires<TQueries>(query)) {
      stack.push(dependency);
    }
  }

  return requiredNames;
}

export function* getQueryForTarget<
  const TQueries extends readonly QueryDefinition[],
  const TTarget extends QueryNames<TQueries>,
>(
  queries: TQueries,
  target: TTarget,
): Generator<readonly TQueries[number][], void> {
  const remaining = getRequiredQueryNames(queries, target);
  const completed = new Set<QueryNames<TQueries>>();

  while (remaining.size > 0) {
    const runnable: TQueries[number][] = [];

    for (const query of queries) {
      if (!remaining.has(query.name)) continue;
      if (
        !getRequires<TQueries>(query).every((dependency) =>
          completed.has(dependency),
        )
      ) {
        continue;
      }

      runnable.push(query);
    }

    if (runnable.length === 0) {
      const blockedQueries = queries
        .filter((query) => remaining.has(query.name))
        .map((query) => query.name);

      throw new Error(
        `Could not resolve runnable queries for target "${target}". Blocked queries: ${blockedQueries.join(", ")}`,
      );
    }

    yield runnable;

    for (const query of runnable) {
      remaining.delete(query.name);
      completed.add(query.name);
    }
  }
}
