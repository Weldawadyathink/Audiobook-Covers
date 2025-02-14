import {
  type DuckDBConnection,
  DuckDBInstance,
  type DuckDBValue,
  FLOAT,
  LIST,
  listValue,
} from "@duckdb/node-api";
import { type ModelOptions, models } from "./models.ts";

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

export interface DBImageData {
  id: string;
  source: string;
  extension: string;
  hash: string;
  searchable: boolean;
  blurhash: string;
}

function formatAsImageData(data: Record<string, DuckDBValue>): DBImageData {
  return {
    id: data.id as any,
    source: data.source as any,
    extension: data.extension as any,
    hash: data.hash as any,
    searchable: data.searchable as any,
    blurhash: data.blurhash as any,
  };
}

export async function getCoverWithVectorSearch(
  vector: Array<number>,
  modelName: ModelOptions,
) {
  const modelData = models[modelName];
  const db = await getDbConnection();

  // Not sql injection safe, but data comes from clip.ts, so not an issue
  const statement = await db.prepare(`
    SELECT 
      id,
      source,
      extension,
      hash,
      searchable,
      blurhash
    FROM image
    ORDER BY array_cosine_distance(
      "${modelData.dbColumn}",
      $1::FLOAT[${modelData.dimensions.toString()}]
    )
    LIMIT 10
  `);
  statement.bindList(1, listValue(vector), LIST(FLOAT));
  const result = await statement.runAndReadAll();
  return result.getRowObjects().map(formatAsImageData);
}

export async function getRandomCoversWithVector(
  modelName?: ModelOptions,
): Promise<DBImageData[]> {
  let model = modelName;
  if (!modelName) {
    model = Object.keys(models)[0] as ModelOptions;
  }
  const modelData = models[model!];
  const vector: number[] = [];
  for (let i = 0; i < modelData.dimensions; i++) {
    // Generate a random number between -1 and 1
    const randomValue = Math.random() * 2 - 1;
    vector.push(randomValue);
  }
  // DB uses cosine comparison, so vector distance does not matter, only a random direction
  return await getCoverWithVectorSearch(vector, model!);
}

export async function getRandomCovers(): Promise<Array<DBImageData>> {
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
    `Returned ${result.length} covers. First image id: ${result[0].id}`,
  );

  console.log("Getting random covers using vector search");
  result = await getRandomCoversWithVector();
  console.log(
    `Returned ${result.length} covers. First image id: ${result[0].id}`,
  );
}

// await _tests();
