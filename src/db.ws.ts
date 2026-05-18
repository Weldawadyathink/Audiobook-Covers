import { Client, Pool, type ClientConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/env.node";
import * as schema from "@/db/schema";

class PlanetScaleWsClient extends Client {
  constructor(config?: string | ClientConfig) {
    super(config);
    this.neonConfig.pipelineConnect = false;
    this.neonConfig.wsProxy = (host, port) => `${host}/v2?address=${host}:${port}`;
  }
}

export function createReadDb() {
  return drizzle({
    client: new Pool({
      connectionString: env.DATABASE_READ_URL,
      Client: PlanetScaleWsClient,
    }),
    schema,
  });
}

export function createWriteDb() {
  return drizzle({
    client: new Pool({
      connectionString: env.DATABASE_WRITE_URL,
      Client: PlanetScaleWsClient,
    }),
    schema,
  });
}
