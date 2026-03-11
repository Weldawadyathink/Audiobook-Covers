import { modelMap, ModelDefinition } from "@/server/models/models";
import { Command } from "commander";
import { getDbWriteConnection } from "@/server/db";
import { DBImageDataValidator, shapeImageDataArray } from "@/server/imageData";
import pLimit from "p-limit";
import "dotenv/config";

const program = new Command();

program
  .requiredOption("-m, --model <text>", "The model to use")
  .option("-s --tablesample <number>", "Reindex a limited sample of images")
  .option("-t --threads <number>", "The number of threads to use", "1");

program.parse(process.argv);

const model: string = program.opts().model;
const modelDefinition = (modelMap as Record<string, ModelDefinition | undefined>)[model];
const tablesample = program.opts().tablesample;
const threads = program.opts().threads;
const limit = pLimit(parseInt(threads));
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
console.log(`Found ${formattedImages.length} images to reembed with ${threads} threads`);

await Promise.allSettled(
  formattedImages.map((image) =>
    limit(async () => {
      const { embedding } = await modelDefinition.getImageEmbedding(image.url);
      await sqlTools.query`
        UPDATE image
        SET ${sql(modelDefinition.dbColumn)} = ${JSON.stringify(embedding)}
        WHERE id = ${image.id}
      `;
      console.log(`Reembedded ${image.id}`);
    }),
  ),
);

await sql.end();
