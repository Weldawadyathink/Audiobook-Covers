import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/env.node";
import * as schema from "@/db/schema";

neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;

export const readClient = neon(env.DATABASE_READ_URL);
export const writeClient = neon(env.DATABASE_WRITE_URL);

export const readDb = drizzle({ client: readClient, schema });
export const writeDb = drizzle({ client: writeClient, schema });

export const db = readDb;
