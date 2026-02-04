import { DBImageDataValidator } from "@/server/imageData";
import { createPool, createSqlTag, DatabasePool } from "slonik";
import { createPgDriverFactory } from "@slonik/pg-driver";
import { createQueryLoggingInterceptor } from "slonik-interceptor-query-logging";
import { z } from "zod/v4";
import Replicate from "replicate";
import "dotenv/config";
import { shapeImageData } from "@/server/imageData";

const replicate = new Replicate();

const global = globalThis as unknown as {
  slonikDbPool: DatabasePool | undefined;
};

const sql = createSqlTag({
  typeAliases: {
    void: z.object({}).strict(),
  },
});

export interface EmbeddingOutput {
  input: string;
  embedding: number[];
}

const model = {
  dimensions: 768,
  getBulkEmbeddings: async (inputs: string[]) => {
    const combinedInput = inputs.join("\n");
    const result = (await replicate.run(
      "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
      {
        input: {
          inputs: combinedInput,
        },
      },
    )) as EmbeddingOutput[];
    return result;
  },
  getTextEmbedding: async (input: string) => {
    const result = (await replicate.run(
      "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
      {
        input: {
          inputs: input,
        },
      },
    )) as EmbeddingOutput[];
    return result[0];
  },
  getImageEmbedding: async (input: string) => {
    const result = (await replicate.run(
      "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
      {
        input: {
          inputs: input,
        },
      },
    )) as EmbeddingOutput[];
    return result[0];
  },
  dbColumn: sql.identifier(["embedding_andreasjansson_clip"]),
};

function getEnv() {
  const env = z
    .object({
      DATABASE_URL: z.url(),
      DATABASE_SCHEMA: z.string().optional(),
      NODE_ENV: z.string().optional(),
      FLY_APP_NAME: z.string(),
      REPLICATE_API_TOKEN: z.string(),
    })
    .parse(process.env);

  return {
    ...env,
  };
}

async function getDbPool(): Promise<DatabasePool> {
  if (!global.slonikDbPool) {
    console.log("Creating database pool");
    global.slonikDbPool = await createPool(getEnv().DATABASE_URL, {
      driverFactory: createPgDriverFactory(),
      interceptors: [createQueryLoggingInterceptor()],
    });
  }
  return global.slonikDbPool;
}

async function main(workerNumber: number) {
  const pool = await getDbPool();

  const images = await pool.any(sql.type(DBImageDataValidator)`
    SELECT id, source, extension, blurhash, from_old_database, searchable
    FROM image WHERE ${model.dbColumn} IS NULL
    ORDER BY RANDOM()
    LIMIT 10
  `);

  if (images.length === 0) {
    console.log(`Worker ${workerNumber}: No images to reindex`);
    return;
  }
  console.log(
    `Worker ${workerNumber}: Found ${images.length} images to reindex`,
  );

  const imageData = await Promise.all(images.map(shapeImageData));

  const embeddings = await model.getBulkEmbeddings(imageData.map((i) => i.url));

  const imageDataWithEmbeddings = embeddings.map((e, i) => ({
    ...imageData[i],
    embedding: e.embedding,
  }));

  console.log(
    `Worker ${workerNumber}: Generated ${embeddings.length} embeddings`,
  );

  for (const image of imageDataWithEmbeddings) {
    await pool.query(sql.typeAlias("void")`
      UPDATE image
      SET ${model.dbColumn} = ${JSON.stringify(image.embedding)}
      WHERE id = ${image.id}
    `);
  }

  console.log(
    `Worker ${workerNumber}: Reindexed ${imageDataWithEmbeddings.length} images`,
  );
  main(workerNumber);
}

main(0);
main(1);
main(2);
main(3);
main(4);
main(5);
main(6);
main(7);
main(8);
main(9);
