import {
  type DuckDBConnection,
  DuckDBInstance,
  type DuckDBValue,
  FLOAT,
  LIST,
  listValue,
} from "@duckdb/node-api";

const global = globalThis as unknown as {
  db: undefined | DuckDBInstance;
  connection: undefined | DuckDBConnection;
};

async function getDbConnection() {
  if (!global.db) {
    global.db = await DuckDBInstance.create("images.db");
  }
  if (!global.connection) {
    global.connection = await global.db.connect();
  }
  return global.connection;
}

export interface ImageData {
  id: string;
  source: string;
  extension: string;
  hash: string;
  embedding: Array<number>;
  searchable: boolean;
  blurhash: string;
}

function updateOutputData(data: Record<string, DuckDBValue>): ImageData {
  return {
    id: data.id as any,
    source: data.source as any,
    extension: data.extension as any,
    hash: data.hash as any,
    embedding: (data.embedding as any).items as any,
    searchable: data.searchable as any,
    blurhash: data.blurhash as any,
  };
}

export async function getCoverVectorSearch(vector: Array<number>) {
  const db = await getDbConnection();
  const statement = await db.prepare(`
    SELECT * FROM image
    ORDER BY array_distance(embedding, $1::FLOAT[768])
    LIMIT 10
  `);
  statement.bindList(1, listValue(vector), LIST(FLOAT));
  const result = await statement.runAndReadAll();
  return result.getRowObjects().map(updateOutputData);
}

export async function getRandomCoversWithVector(): Promise<Array<ImageData>> {
  const dimensions = 768;
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    // Generate a random number between -1 and 1
    const randomValue = Math.random() * 2 - 1;
    vector.push(randomValue);
  }
  return await getCoverVectorSearch(vector);
}

export async function getRandomCovers(): Promise<Array<ImageData>> {
  const db = await getDbConnection();
  const result = await db.runAndReadAll(`
    SELECT * FROM image ORDER BY random() LIMIT 10;
  `);
  return result.getRowObjects().map(updateOutputData);
}

console.log(await getRandomCoversWithVector());
