import { ImageData, shapeImageData } from "./imageData.ts";
import { ModelDefinition, models } from "./models.ts";
import { getDbPool, sql } from "./db.ts";

async function reindexPicture(img: ImageData, model: ModelDefinition) {
  const replicate = await model.getImageEmbedding(img.url);
  await pool.query(
    sql.unsafe`
      UPDATE image
      SET ${model.dbColumn} = ${JSON.stringify(replicate.embedding)}
      WHERE id = ${img.id}
    `,
  );
  console.log(`Updated ${img.id} embedding in database`);
}

async function reindexAllImages(model: ModelDefinition) {
  const start = performance.now();
  const pool = await getDbPool();
  const images = await pool.any(
    sql.typeAlias("imageData")`
      SELECT *
      FROM image
      WHERE ${model.dbColumn} IS NULL
      ORDER BY RANDOM()
      LIMIT 10
    `,
  );
  if (images.length === 0) {
    console.log(`No images found.`);
    return;
  }
  console.log(`Selected ${images.length} images from database to embed`);
  const imgData = await shapeImageData(images);
  await Promise.all(imgData.map((i) => reindexPicture(i, model)));
  const time = (performance.now() - start) / 1000;
  console.log(`Reindexed ${images.length} images in ${time.toFixed(0)}s`);
  return await reindexAllImages(model);
}

if (import.meta.main) {
  const modelName = Deno.args[0];
  const processes = Deno.args[1] || 2;
  const model = models[modelName];
  console.log(`Generating embeddings for ${modelName}`);
  await Promise.all(
    // Runs two reindexing processes at the same time
    // In theory, there will be collisions where both processes will
    // select the same images to embed. Very likely at the end of the
    // embed process. But one will just overwrite the other in the
    // database, so it just costs a little extra in compute.
    Array.apply(null, Array(processes)).map(() => reindexAllImages(model)),
  );
}
