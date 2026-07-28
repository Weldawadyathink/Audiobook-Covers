import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { env } from "@/env.node";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DATABASE_WRITE_URL,
  },
  schemaFilter: env.APP_STAGE === "production" ? ["prod"] : ["dev"],
  strict: true,
});
