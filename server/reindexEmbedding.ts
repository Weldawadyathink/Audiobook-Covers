import { getImageEmbedding } from "./clip.ts";
import { ImageData, shapeImageData } from "./imageData.ts";
import { db } from "../db/index.ts";
import { image } from "../db/schema.ts";
import { eq, isNull } from "drizzle-orm";

async function reindexPicture(img: ImageData) {
  const replicate = await getImageEmbedding(img.url);
  await db.update(image)
    .set({ embedding_mobileclip_s1: replicate.embedding })
    .where(eq(image.id, img.id));
  console.log(`Updated ${img.id} embedding in database`);
}

async function reindexAllImages() {
  const start = performance.now();
  const images = await db.select()
    .from(image)
    .where(isNull(image.embedding_mobileclip_s1))
    .limit(500);
  const imgData = await shapeImageData(images);
  await Promise.all(imgData.map(reindexPicture));
  console.log(`Reindexing complete in ${performance.now() - start}ms`);
}

if (import.meta.main) {
  await reindexAllImages();
}
