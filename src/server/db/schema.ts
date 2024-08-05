import {
  boolean,
  pgTableCreator,
  text,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator(
  (name) => `audiobook-covers-next_${name}`,
);

export const image = createTable("image", {
  id: uuid("id").primaryKey(),
  source: text("source"),
  extension: text("extension"),
  hash: text("hash"),
  blurhash: text("blurhash"),
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-assignment
  embedding: vector("embedding", { dimensions: 768 }),
  searchable: boolean("searchable"),
});
