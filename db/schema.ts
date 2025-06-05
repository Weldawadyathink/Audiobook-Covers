import { boolean, pgTable, text, uuid, vector } from "drizzle-orm/pg-core";
import { db } from "./index.ts";

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
