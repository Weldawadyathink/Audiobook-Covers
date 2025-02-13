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

export async function getDbConnection() {
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

function formatAsImageData(data: Record<string, DuckDBValue>): ImageData {
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
    ORDER BY array_cosine_distance(embedding, $1::FLOAT[${dimensions.toString()}])
    LIMIT 10
  `);
  statement.bindList(1, listValue(vector), LIST(FLOAT));
  const result = await statement.runAndReadAll();
  return result.getRowObjects().map(formatAsImageData);
}

export async function getRandomCoversWithVector(): Promise<Array<ImageData>> {
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
  return result.getRowObjects().map(formatAsImageData);
}

async function _tests() {
  let result: any = null;
  console.log("Getting random covers with SQL random");
  result = await getRandomCovers();
  console.log(
    `Returned ${result.length} covers. The first vector has ${
      result[0].embedding.length
    } dimensions`,
  );

  console.log("Getting random covers using vector search");
  result = await getRandomCoversWithVector();
  console.log(
    `Returned ${result.length} covers. The first vector has ${
      result[0].embedding.length
    } dimensions`,
  );
}

// await _tests();
