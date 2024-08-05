import { image } from "@/server/db/schema";
import { db } from "@/server/db";
import { eq, isNull } from "drizzle-orm";
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

interface ClipReturnObject {
  input: string;
  embedding: Array<number>;
}

const result = await db
  .select({ id: image.id, extension: image.extension })
  .from(image)
  .where(isNull(image.embedding))
  .limit(10);

const dbUpdatePromises = [];

for (const { id, extension } of result) {
  const url = `https://f001.backblazeb2.com/file/com-audiobookcovers/original/${id}.${extension}`;
  const [output] = (await replicate.run(
    "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
    {
      input: {
        inputs: url,
      },
    },
  )) as Array<ClipReturnObject>;
  console.log(`Generated ${id}`);
  dbUpdatePromises.push(
    db
      .update(image)
      // @ts-expect-error replicate will always return a result
      .set({ embedding: output.embedding })
      .where(eq(image.id, id)),
  );
}

console.log("Completed retrieving embeddings");

await Promise.all(dbUpdatePromises);

console.log("Completed database updates");
