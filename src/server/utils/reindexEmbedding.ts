import { getDbConnection } from "../db.ts";
import { dimensions, getImageEmbedding } from "./clip.ts";
import { FLOAT, LIST, listValue } from "@duckdb/node-api";

async function getImageIds() {
  const db = await getDbConnection();
  const results = await db.runAndReadAll(`
    SELECT id, extension
    FROM image
    WHERE metaclip IS NULL
--     LIMIT 1000
  `);
  return results.getRows();
}

async function getLocalImageEmbedding(data: [string, string]) {
  const [id, extension] = data;
  const imagePath = `./images/original/${id}.${extension}`;
  const vector = await getImageEmbedding(imagePath);
  return {
    id: id,
    extension: extension,
    vector: vector,
  };
}

async function setEmbeddingInDb(
  data: Awaited<ReturnType<typeof getLocalImageEmbedding>>,
) {
  const db = await getDbConnection();
  const statement = await db.prepare(`
    UPDATE image
    SET metaclip = $1::FLOAT[${dimensions.toString()}]
    WHERE id = $2;
  `);
  statement.bindList(1, listValue(data.vector), LIST(FLOAT));
  statement.bindVarchar(2, data.id);
  await statement.run();
}

async function main() {
  const ids = await getImageIds() as unknown as Array<[string, string]>;
  console.log(`Starting embedding on ${ids.length} images`);
  const promises = ids.map((data) =>
    getLocalImageEmbedding(data).then(setEmbeddingInDb)
  );
  await Promise.all(promises);
  console.log(`Finished embedding on ${ids.length} images`);
}

await main();
