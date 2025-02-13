import { getDbConnection } from "../db.ts";
import {
  getImageEmbedding,
  getVisionModel,
  type ModelOptions,
  models,
} from "./clip.ts";
import { FLOAT, LIST, listValue } from "@duckdb/node-api";

async function reindexPicture(data: {
  id: string;
  extension: string;
  modelName: ModelOptions;
}) {
  const imagePath = `./images/original/${data.id}.${data.extension}`;
  if (!(data.modelName in models)) {
    throw new Error("Model name not recognized");
  }
  const modelData = models[data.modelName];
  const vector = await getImageEmbedding(imagePath, data.modelName);
  const db = await getDbConnection();
  // This is not sql injection safe, but none of these are user defined values
  const statement = await db.prepare(`
    UPDATE image
    SET "${modelData.dbColumn}" = $1::FLOAT[${modelData.dimensions}]
    WHERE id = '${data.id}'
  `);
  statement.bindList(1, listValue(vector), LIST(FLOAT));
  await statement.run();
}

async function getImageIds(limit: number, nullColumn: string) {
  const db = await getDbConnection();
  const results = await db.runAndReadAll(`
    SELECT id, extension
    FROM image
    WHERE "${nullColumn}" IS NULL
    LIMIT ${limit}
  `);
  return results.getRowObjects() as [{ id: string; extension: string }];
}

async function reindexAllImagesForModel(
  modelName: ModelOptions,
  batchSize: number,
) {
  if (!(modelName in models)) {
    throw new Error("Model name not recognized");
  }
  const modelData = models[modelName];

  let images: Array<{ id: string; extension: string }> = [];
  do {
    images = await getImageIds(batchSize, modelData.dbColumn);
    console.log(`Indexing ${images.length} images with ${modelName}`);
    await Promise.all(
      images.map((image) =>
        reindexPicture({
          id: image.id,
          extension: image.extension,
          modelName: modelName,
        })
      ),
    );
  } while (images.length != 0);
  console.log(`Indexing with ${modelName} complete`);
}

async function main() {
  for (const [model, _] of Object.entries(models)) {
    await getVisionModel(model as ModelOptions);
    await reindexAllImagesForModel(model as ModelOptions, 500);
  }
  console.log(`Completed database reindex`);
}

await main();
