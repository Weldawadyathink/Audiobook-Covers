import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { modelMap } from "@/searchModels/models";
import { createWriteDb } from "@/db.node";
import { shapeImageData } from "@/server/imageData";
import { env } from "@/env.node";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export const rebuildEmbeddingTask = schemaTask({
  id: "rebuild-embedding",
  schema: z.object({
    id: z.string(),
    modelName: z.string(),
  }),
  machine: "micro",
  run: async ({ id, modelName }) => {
    if (!modelMap[modelName]) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const model = modelMap[modelName];

    const db = createWriteDb();
    const imageData = await db.query.image.findFirst({
      columns: {
        id: true,
        source: true,
        reddit_post_id: true,
        reddit_comment_id: true,
        extension: true,
        searchable: true,
        blurhash: true,
        deleted: true,
        openlibrary_work_id: true,
        openlibrary_work_id_confidence: true,
        openlibrary_work_id_model: true,
        embedding_jina_clip_v2: true,
      },
      where: (image, { eq }) => eq(image.id, id),
    });

    if (!imageData) {
      throw new Error(`No image found with id: ${id}`);
    }

    console.log(
      `Rebuilding embedding for id: ${imageData.id} using model: ${modelName}`,
    );

    const shapedData = await shapeImageData(imageData);

    const embedding = await model.getImageEmbedding(shapedData.url, env);

    await db
      .update(schema.image)
      .set({ [model.dbColumn]: embedding.embedding })
      .where(eq(schema.image.id, id));
  },
});
