import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  vector,
  pgSchema,
  type PgSchema,
} from "drizzle-orm/pg-core";
import { env } from "@/env.node";

export const schema =
  env.APP_STAGE === "production"
    ? pgSchema("prod")
    : (pgSchema("dev") as unknown as PgSchema<"prod">);

export const reddit_post = schema.table(
  "reddit_post",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(),
    title: text("title"),
    body: text("body"),
    author: text("author"),
    flair: text("flair"),
  },
  (table) => [index("idx_reddit_post_status").on(table.status)],
);

export const reddit_comment = schema.table(
  "reddit_comment",
  {
    id: uuid("id").primaryKey(),
    post_id: text("post_id").notNull(),
    parent_comment_id: uuid("parent_comment_id"),
    content: text("content"),
  },
  (table) => [
    foreignKey({
      columns: [table.post_id],
      foreignColumns: [reddit_post.id],
      name: "reddit_comment_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parent_comment_id],
      foreignColumns: [table.id],
      name: "reddit_comment_parent_comment_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const image = schema.table(
  "image",
  {
    id: uuid("id").primaryKey(),
    source: text("source"),
    reddit_post_id: text("reddit_post_id"),
    reddit_comment_id: uuid("reddit_comment_id"),
    extension: text("extension"),
    old_hash: text("old_hash"),
    searchable: boolean("searchable").default(true),
    blurhash: text("blurhash"),
    hash: text("hash"),
    from_old_database: boolean("from_old_database").default(false),
    deleted: boolean("deleted").notNull().default(false),
    openlibrary_work_id: text("openlibrary_work_id"),
    openlibrary_work_id_confidence: text("openlibrary_work_id_confidence"),
    openlibrary_work_id_model: text("openlibrary_work_id_model"),
    embedding_jina_clip_v2: vector("embedding_jina_clip_v2", {
      dimensions: 1024,
    }),
  },
  (table) => [
    index("idx_image_hash").using("btree", table.hash),
    index("idx_image_searchable").using("btree", table.searchable),
    foreignKey({
      columns: [table.reddit_post_id],
      foreignColumns: [reddit_post.id],
      name: "fk_image_reddit_post_id",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.reddit_comment_id],
      foreignColumns: [reddit_comment.id],
      name: "fk_image_reddit_comment_id",
    }).onDelete("set null"),
  ],
);

export const openlibrary_work = schema.table(
  "openlibrary_work",
  {
    olid: text("olid").primaryKey(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    author_names: text("author_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    author_aliases: text("author_aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    title_aliases: text("title_aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    first_publish_year: integer("first_publish_year"),
    edition_count: integer("edition_count"),
    canonical_score: integer("canonical_score"),
  },
  (table) => [
    index("idx_openlibrary_work_title_search").using(
      "gin",
      sql`to_tsvector('simple'::regconfig, COALESCE(${table.title}, ''))`,
    ),
    index("idx_openlibrary_work_author_names_search").using(
      "gin",
      sql`to_tsvector('simple'::regconfig, immutable_array_to_string(${table.author_names}, ' '))`,
    ),
  ],
);

export const web_user = schema.table(
  "web_user",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    password_hash: text("password_hash").notNull(),
  },
  (table) => [unique("web_user_username_key").on(table.username)],
);

export const session = schema.table(
  "session",
  {
    session_id: text("session_id").primaryKey(),
    user_id: integer("user_id").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_sessions_user_id").on(table.user_id),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [web_user.id],
      name: "session_user_id_fkey",
    }).onDelete("cascade"),
  ],
);
