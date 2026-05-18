import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { databaseUrlWithSearchPath } from "./drizzle.config.shared";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrlWithSearchPath("audiobookcovers_dev"),
  },
  schemaFilter: ["audiobookcovers_dev", "public"],
  migrations: {
    schema: "audiobookcovers_dev",
    table: "__drizzle_migrations_dev",
  },
  breakpoints: true,
  strict: true,
});
