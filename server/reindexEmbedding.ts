import { ImageData, shapeImageData } from "./imageData.ts";
import { ModelDefinition, models } from "./models.ts";
import { pool, sql } from "./db.ts";

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
  const images = await pool.any(
    sql.typeAlias("imageData")`
      SELECT *
      FROM image
      WHERE ${model.dbColumn} IS NULL
      ORDER BY RANDOM()
      LIMIT 50
    `,
  );
  if (images.length === 0) {
    console.log(`No images found.`);
    return;
  }
  const imgData = await shapeImageData(images);
  await Promise.all(imgData.map((i) => reindexPicture(i, model)));
  const time = (performance.now() - start) / 1000;
  console.log(`Reindexed ${images.length} images in ${time.toFixed(0)}s`);
  return await reindexAllImages(model);
}

if (import.meta.main) {
  await reindexAllImages(models["mobileclip_s0"]);
}
