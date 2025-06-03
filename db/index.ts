import { drizzle } from "drizzle-orm/node-postgres";

// You can specify any property from the node-postgres connection options
export const db = drizzle({
  connection: {
    connectionString: Deno.env.get("DATABASE_URL"),
    ssl: true,
  },
});
