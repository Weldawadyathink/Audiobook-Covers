import { modelMap, ModelDefinition } from "@/server/models/models";
import { Command } from "commander";
import { getDbWriteConnection } from "@/server/db";
import { DBImageDataValidator, shapeImageDataArray } from "@/server/imageData";
import pLimit from "p-limit";
import "dotenv/config";

function chunk<T>(array: T[], size: number): T[][] {
  return array.reduce((chunks, item, index) => {
    if (index % size === 0) chunks.push([]);
    chunks[chunks.length - 1].push(item);
    return chunks;
  }, [] as T[][]);
}

function zip<T1, T2>(array1: T1[], array2: T2[]): [T1, T2][] {
  return array1.map((item, index) => [item, array2[index]]);
}

const program = new Command();

program
  .requiredOption("-m, --model <text>", "The model to use")
  .option("-s --tablesample <number>", "Reindex a limited sample of images")
  .option("-t --threads <number>", "The number of threads to use", "1")
  .option(
    "-b --batch-size <number>",
    "Number of images to send per request",
    "1",
  );

program.parse(process.argv);

const model: string = program.opts().model;
const modelDefinition = (
  modelMap as Record<string, ModelDefinition | undefined>
)[model];
const tablesample = program.opts().tablesample;
const threads = parseInt(program.opts().threads);
const batchSize = parseInt(program.opts().batchSize);
const limit = pLimit(threads);
if (!modelDefinition) {
  console.error(`Model ${model} not found`);
  process.exit(1);
}

const { sql, sqlTools } = getDbWriteConnection();

const images = await sqlTools.many(DBImageDataValidator)`
  SELECT id, source, extension, blurhash, from_old_database, searchable
  FROM image
  ${tablesample ? sql`TABLESAMPLE BERNOULLI(${tablesample})` : sql``}
  WHERE ${sql(modelDefinition.dbColumn)} IS NULL
`;

const formattedImages = await shapeImageDataArray(images);
console.log(
  `Found ${formattedImages.length} images to reembed with ${threads} threads and batch size ${batchSize}`,
);

if (batchSize === 1) {
  await Promise.allSettled(
    formattedImages.map((image) =>
      limit(async () => {
        const { embedding } = await modelDefinition.getImageEmbedding(
          image.jpeg[640],
        );
        await sqlTools.query`
          UPDATE image
          SET ${sql(modelDefinition.dbColumn)} = ${JSON.stringify(embedding)}
          WHERE id = ${image.id}
        `;
        console.log(`Reembedded ${image.id}`);
      }),
    ),
  );
} else {
  const batches = chunk(formattedImages, batchSize);
  await Promise.allSettled(
    batches.map((batch) =>
      limit(async () => {
        const embeddings = await modelDefinition.getImageEmbeddings(
          batch.map((image) => image.jpeg[640]),
        );
        for (const [image, embedding] of zip(batch, embeddings)) {
          await sqlTools.query`
            UPDATE image
            SET ${sql(modelDefinition.dbColumn)} = ${JSON.stringify(embedding)}
            WHERE id = ${image.id}
          `;
        }
        console.log(
          `Reembedded batch of ${batchSize} images: ${batch.map((image) => image.id).join(", ")}`,
        );
      }),
    ),
  );
}

await sql.end();
