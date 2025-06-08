import { hash as runHash } from "node-image-hash";
import { getDbConnection } from "./db.ts";

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

async function hashPicture(data: {
  id: string;
  extension: string;
}) {
  const imagePath = `./images/original/${data.id}.${data.extension}`;
  const { hash } = await runHash(imagePath, 64, "binary");

  const db = await getDbConnection();
  // This is not sql injection safe, but none of these are user defined values
  const statement = await db.prepare(`
    UPDATE image
    SET "hash" = $1
    WHERE id = '${data.id}'
  `);
  statement.bindVarchar(1, hash);
  await statement.run();
}

async function rehashAllImages(batchSize: number) {
  let images: Array<{ id: string; extension: string }> = [];
  do {
    images = await getImageIds(batchSize, "hash");
    console.log(`Indexing ${images.length} images.`);
    await Promise.all(
      images.map((image) =>
        hashPicture({
          id: image.id,
          extension: image.extension,
        })
      ),
    );
  } while (images.length != 0);
  console.log(`Indexing complete`);
}

await rehashAllImages(500);
