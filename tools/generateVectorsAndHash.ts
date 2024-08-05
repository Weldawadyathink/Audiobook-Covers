import { runSingleClip } from "@/server/utils/clip";
import { image } from "@/server/db/schema";
import { db } from "@/server/db";
import { eq, isNull, sql } from "drizzle-orm";
import { blurhashEncode } from "@/server/utils/blurhash";

function addUrl(row: { id: string; extension: string | null }) {
  return {
    id: row.id,
    url: `https://f001.backblazeb2.com/file/com-audiobookcovers/original/${row.id}.${row.extension}`,
    extension: row.extension,
  };
}

const url =
  "https://f001.backblazeb2.com/file/com-audiobookcovers/original/16b81153-ce37-4868-8212-800284529c02.jpeg";

async function reindexDb(batchSize: number) {
  const result = await db
    .select({ id: image.id, extension: image.extension })
    .from(image)
    // .where(isNull(image.embedding))
    // .orderBy(sql`RANDOM()`)
    .where(eq(image.id, "16b81153-ce37-4868-8212-800284529c02"))
    .limit(batchSize);

  if (result.length === 0) {
    return;
  }

  const hashesPromises = result.map(addUrl).map(async (row) => {
    return {
      id: row.id,
      blurhash: await blurhashEncode(row.url),
    };
  });

  const replicatePromises = result.map(addUrl).map(async (row) => {
    return {
      id: row.id,
      replicate: await runSingleClip(row.url),
    };
  });
  console.log("Started replicate calls");

  const hashes = await Promise.all(hashesPromises);
  console.log("Completed all blurhashes");

  const dbPromises: Promise<unknown>[] = [];
  for (const hash of hashes) {
    dbPromises.push(
      db
        .update(image)
        .set({ blurhash: hash.blurhash })
        .where(eq(image.id, hash.id)),
    );
  }

  const replicateDatas = await Promise.all(replicatePromises);
  console.log("Completed replicate data");
  for (const replicateData of replicateDatas) {
    dbPromises.push(
      db
        .update(image)
        .set({ embedding: replicateData.replicate.embedding })
        .where(eq(image.id, replicateData.id)),
    );
  }

  await Promise.all(dbPromises);
  console.log("*** Completed all database inserts ***");
}

await reindexDb(1);

console.log("<><><> COMPLETE <><><>");
// 4734 total
// 3023
