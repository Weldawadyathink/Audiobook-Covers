import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/env.node";
import * as schema from "@/db/schema";

if (globalThis.WebSocket) {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
}
neonConfig.pipelineConnect = false;
neonConfig.wsProxy = (host, port) => `${host}/v2?address=${host}:${port}`;

export const readPool = new Pool({ connectionString: env.DATABASE_READ_URL });
export const writePool = new Pool({ connectionString: env.DATABASE_WRITE_URL });

export const readDb = drizzle({ client: readPool, schema });
export const writeDb = drizzle({ client: writePool, schema });

export const db = readDb;
