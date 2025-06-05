import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, pgTable, text, uuid, vector } from "drizzle-orm/pg-core";

export const db = drizzle({
  connection: {
    connectionString: Deno.env.get("DATABASE_URL"),
    ssl: true,
  },
});

export const image = pgTable("image", {
  id: uuid("id").primaryKey(),
  source: text("source"),
  extension: text("extension"),
  hash: text("hash"),
  blurhash: text("blurhash"),
  embedding: vector("embedding", { dimensions: 768 }),
  embedding_mobileclip_s1: vector("embedding_mobileclip_s1", {
    dimensions: 512,
  }),
  searchable: boolean("searchable"),
});
