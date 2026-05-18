import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { databaseUrlWithSearchPath } from "./drizzle.config.shared";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrlWithSearchPath("audiobookcovers"),
  },
  schemaFilter: ["audiobookcovers", "public"],
  migrations: {
    schema: "audiobookcovers",
    table: "__drizzle_migrations_prod",
  },
  breakpoints: true,
  strict: true,
});
