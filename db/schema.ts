import { boolean, pgTable, text, uuid, vector } from "drizzle-orm/pg-core";
import { db } from "./index.ts";

export const image = pgTable("image", {
  id: uuid("id").primaryKey(),
  source: text("source"),
  extension: text("extension"),
  hash: text("hash"),
  blurhash: text("blurhash"),
  embedding: vector("embedding", { dimensions: 768 }),
  searchable: boolean("searchable"),
});

if (import.meta.main) {
  const result = await db.select().from(image).limit(10);
  console.log(result);
}
