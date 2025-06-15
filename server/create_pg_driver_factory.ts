// @ts-nocheck I know this code works, but has some type errors

// Taken from: https://github.com/lopkol/sff-vektor/blob/a08f6b303295775443efcaf8a5050e627015c82c/slonik-pg-driver/create_pg_driver_factory.ts#L199-L206

/**
 * This file is a fork of the slonik pg driver factory
 * @see https://github.com/gajus/slonik/blob/main/packages/pg-driver/src/factories/createPgDriverFactory.ts
 *
 * It fixes an issue with Deno and node-postgres (pg) library
 * @see https://github.com/brianc/node-postgres/issues/3420
 */

import {
  createDriverFactory,
  type DriverCommand,
  type DriverConfiguration,
  type DriverFactory,
  type DriverTypeParser,
} from "slonik";
import {
  BackendTerminatedError,
  BackendTerminatedUnexpectedlyError,
  CheckExclusionConstraintViolationError,
  CheckIntegrityConstraintViolationError,
  ForeignKeyIntegrityConstraintViolationError,
  IdleTransactionTimeoutError,
  InputSyntaxError,
  InvalidInputError,
  NotNullIntegrityConstraintViolationError,
  StatementCancelledError,
  StatementTimeoutError,
  UnexpectedStateError,
  UniqueIntegrityConstraintViolationError,
} from "slonik";
import type { PrimitiveValueExpression } from "slonik";
import type { Field, Query } from "slonik";
import { parseDsn } from "slonik";
import { Transform } from "node:stream";
import pg from "pg";
import QueryStream from "pg-query-stream";
import { getTypeParser as getNativeTypeParser } from "pg-types";
import { parse as parseArray } from "postgres-array";

type PgClient = pg.Client;
// This code needs to manipulate the public connection property of the pg.Client class.
// This is a workaround as it is not exposed by the type definitions.
type PgClientWithConnection = PgClient & { connection: pg.Connection };
type NativePostgresClientConfiguration = pg.ClientConfig;
type DatabaseError = pg.DatabaseError;

type PgError = Error & { code: string };

type PostgresType = {
  oid: string;
  typarray: string;
  typname: string;
};

type TypeOverrides = (oid: number) => any;

const createTypeOverrides = async (
  connection: PgClient,
  typeParsers: readonly DriverTypeParser[],
): Promise<TypeOverrides> => {
  const typeNames = typeParsers.map((typeParser) => {
    return typeParser.name;
  });

  const postgresTypes = (
    await connection.query(
      `
        SELECT
          oid,
          typarray,
          typname
        FROM pg_type
        WHERE typname = ANY($1::text[])
      `,
      [typeNames],
    )
  ).rows as PostgresType[];

  const parsers: Record<string, (value: string) => unknown> = {};

  for (const typeParser of typeParsers) {
    const postgresType = postgresTypes.find((maybeTargetPostgresType) => {
      return maybeTargetPostgresType.typname === typeParser.name;
    });

    if (!postgresType) {
      throw new Error('Database type "' + typeParser.name + '" not found.');
    }

    parsers[postgresType.oid] = (value: string) => {
      return typeParser.parse(value);
    };

    if (postgresType.typarray) {
      parsers[postgresType.typarray] = (arrayValue: string) => {
        return parseArray(arrayValue).map((value) => {
          return typeParser.parse(value);
        });
      };
    }
  }

  return (oid: number) => {
    if (parsers[oid]) {
      return parsers[oid];
    }

    return getNativeTypeParser(oid);
  };
};

const createClientConfiguration = (
  clientConfiguration: DriverConfiguration,
): NativePostgresClientConfiguration => {
  const connectionOptions = parseDsn(clientConfiguration.connectionUri);

  const poolConfiguration: NativePostgresClientConfiguration = {
    application_name: connectionOptions.applicationName,
    database: connectionOptions.databaseName,
    host: connectionOptions.host,
    options: connectionOptions.options,
    password: connectionOptions.password,
    port: connectionOptions.port,
    // @ts-ignore: https://github.com/brianc/node-postgres/pull/3214
    queryMode: "extended",
    ssl: false,
    user: connectionOptions.username,
  };

  if (clientConfiguration.ssl) {
    poolConfiguration.ssl = clientConfiguration.ssl;
  } else if (connectionOptions.sslMode === "disable") {
    poolConfiguration.ssl = false;
  } else if (connectionOptions.sslMode === "require") {
    poolConfiguration.ssl = true;
  } else if (connectionOptions.sslMode === "no-verify") {
    poolConfiguration.ssl = {
      rejectUnauthorized: false,
    };
  }

  if (clientConfiguration.connectionTimeout !== "DISABLE_TIMEOUT") {
    if (clientConfiguration.connectionTimeout === 0) {
      poolConfiguration.connectionTimeoutMillis = 1;
    } else {
      poolConfiguration.connectionTimeoutMillis =
        clientConfiguration.connectionTimeout;
    }
  }

  if (clientConfiguration.statementTimeout !== "DISABLE_TIMEOUT") {
    if (clientConfiguration.statementTimeout === 0) {
      poolConfiguration.statement_timeout = 1;
    } else {
      poolConfiguration.statement_timeout =
        clientConfiguration.statementTimeout;
    }
  }

  if (
    clientConfiguration.idleInTransactionSessionTimeout !== "DISABLE_TIMEOUT"
  ) {
    if (clientConfiguration.idleInTransactionSessionTimeout === 0) {
      poolConfiguration.idle_in_transaction_session_timeout = 1;
    } else {
      poolConfiguration.idle_in_transaction_session_timeout =
        clientConfiguration.idleInTransactionSessionTimeout;
    }
  }

  return poolConfiguration;
};

const queryTypeOverrides = async (
  pgClientConfiguration: NativePostgresClientConfiguration,
  driverConfiguration: DriverConfiguration,
): Promise<TypeOverrides> => {
  const client = new pg.Client(pgClientConfiguration);

  await client.connect();

  const typeOverrides = await createTypeOverrides(
    client,
    driverConfiguration.typeParsers,
  );

  await endClientConnection(client);

  return typeOverrides;
};

/**
 * @author github.com/SylvainMarty
 * @description This is a workaround to fix the "end" event not being emitted when the SSL connection is closed (specific to Deno).
 * @see https://github.com/brianc/node-postgres/issues/3420
 */
async function endClientConnection(client: PgClient) {
  if (client.ssl) {
    (client as PgClientWithConnection).connection.stream.on("end", () => {
      (client as PgClientWithConnection).connection.emit("end");
    });
  }
  await client.end();
}

const isErrorWithCode = (error: Error): error is DatabaseError => {
  return "code" in error;
};

// query is not available for connection-level errors.
// TODO evaluate if we can remove query from the error object.
// I suspect we should not be even using InputSyntaxError as one of the error types.
// @see https://github.com/gajus/slonik/issues/557
const wrapError = (error: PgError, query: null | Query) => {
  if (
    error.message.toLowerCase().includes("connection terminated unexpectedly")
  ) {
    return new BackendTerminatedUnexpectedlyError(error);
  }

  if (error.message.toLowerCase().includes("connection terminated")) {
    return new BackendTerminatedError(error);
  }

  if (!isErrorWithCode(error)) {
    return error;
  }

  if (error.code === "22P02") {
    return new InvalidInputError(error.message);
  }

  if (error.code === "25P03") {
    return new IdleTransactionTimeoutError(error);
  }

  if (error.code === "57P01") {
    return new BackendTerminatedError(error);
  }

  if (
    error.code === "57014" &&
    // The code alone is not enough to distinguish between a statement timeout and a statement cancellation.
    error.message.includes("canceling statement due to user request")
  ) {
    return new StatementCancelledError(error);
  }

  if (error.code === "57014") {
    return new StatementTimeoutError(error);
  }

  if (error.code === "23502") {
    return new NotNullIntegrityConstraintViolationError(error);
  }

  if (error.code === "23503") {
    return new ForeignKeyIntegrityConstraintViolationError(error);
  }

  if (error.code === "23505") {
    return new UniqueIntegrityConstraintViolationError(error);
  }

  if (error.code === "23P01") {
    return new CheckExclusionConstraintViolationError(error);
  }

  if (error.code === "23514") {
    return new CheckIntegrityConstraintViolationError(error);
  }

  if (error.code === "42601") {
    if (!query) {
      return new UnexpectedStateError("Expected query to be provided");
    }

    return new InputSyntaxError(error, query);
  }

  return error;
};

export const createPgDriverFactory = (): DriverFactory => {
  return createDriverFactory(async ({ driverConfiguration }) => {
    const clientConfiguration = createClientConfiguration(driverConfiguration);

    // eslint-disable-next-line require-atomic-updates
    clientConfiguration.types = {
      getTypeParser: await queryTypeOverrides(
        clientConfiguration,
        driverConfiguration,
      ),
    };

    return {
      createPoolClient: async ({ clientEventEmitter }) => {
        const client = new pg.Client(clientConfiguration);

        // We will see this triggered when the connection is terminated, e.g.
        // "terminates transactions that are idle beyond idleInTransactionSessionTimeout" test.
        const onError = (error: PgError) => {
          clientEventEmitter.emit("error", wrapError(error, null));
        };

        const onNotice = (notice: Error) => {
          if (notice.message) {
            clientEventEmitter.emit("notice", {
              message: notice.message,
            });
          }
        };

        // @ts-ignore: ignore error
        client.on("error", onError);
        // @ts-ignore: ignore error
        client.on("notice", onNotice);

        return {
          connect: async () => {
            await client.connect();
          },
          end: async () => {
            await endClientConnection(client);

            client.removeListener("error", onError);
            client.removeListener("notice", onNotice);
          },
          query: async (sql, values) => {
            let result;

            try {
              result = await client.query(sql, values as unknown[]);
            } catch (error) {
              throw wrapError(error as PgError, {
                sql,
                values: values as readonly PrimitiveValueExpression[],
              });
            }

            if (Array.isArray(result)) {
              throw new InvalidInputError(
                "Must not use multiple statements in a single query.",
              );
            }

            return {
              command: result.command as DriverCommand,
              fields: result.fields.map((field) => {
                return {
                  dataTypeId: field.dataTypeID,
                  name: field.name,
                };
              }),
              rowCount: result.rowCount,
              rows: result.rows,
            };
          },
          stream: (sql, values) => {
            const stream = client.query(
              new QueryStream(sql, values as unknown[]),
            );

            let fields: readonly Field[] = [];

            // `rowDescription` will not fire if the query produces a syntax error.
            // Also, `rowDescription` won't fire until client starts consuming the stream.
            // This is why we cannot simply await for `rowDescription` event before starting to pipe the stream.
            (client as PgClientWithConnection).connection.once(
              "rowDescription",
              (rowDescription: { fields: readonly pg.FieldDef[] }) => {
                fields = rowDescription.fields.map((field) => {
                  return {
                    dataTypeId: field.dataTypeID,
                    name: field.name,
                  };
                });
              },
            );

            const transform = new Transform({
              objectMode: true,
              async transform(datum, enc, callback) {
                if (!fields) {
                  callback(new Error("Fields not available"));

                  return;
                }

                this.push({
                  fields,
                  row: datum,
                });

                callback();
              },
            });

            stream.on("error", (error: PgError) => {
              transform.emit(
                "error",
                wrapError(error, {
                  sql,
                  values: values as PrimitiveValueExpression[],
                }),
              );
            });

            return stream.pipe(transform);
          },
        };
      },
    };
  });
};
