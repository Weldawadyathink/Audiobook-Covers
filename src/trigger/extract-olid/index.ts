import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { z as zv4 } from "zod/v4";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { batchTriggerAndWaitSettled, triggerAndWait } from "../utils";
import { extractOlidPhase1Task } from "./phase1";
import { extractOlidPhase2Task } from "./phase2";
import { extractOlidPhase3Task } from "./phase3";
import { extractOlidPhase4Task } from "./phase4";

const IMAGE_URL_PREFIX = "https://images.audiobookcovers.com";
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

const ExtractOlidModelsPayload = z
  .object({
    phase1: z.string().optional(),
    phase2: z.string().optional(),
    phase3: z.string().optional(),
    phase4: z.string().optional(),
  })
  .optional();

const ExtractOlidPayload = z.object({
  imageId: z.string(),
  model: z.string().optional().default(DEFAULT_MODEL),
  models: ExtractOlidModelsPayload,
  save: z.boolean().optional().default(false),
});

const ExtractOlidBatchPayload = z.object({
  model: z.string().optional().default(DEFAULT_MODEL),
  models: ExtractOlidModelsPayload,
  save: z.boolean().optional().default(true),
  limit: z.number().int().positive().optional(),
  tablesample: z.number().positive().max(100).optional(),
});

type ExtractOlidModels = [string, string, string, string];

const ImageIdRow = zv4.object({
  id: zv4.string(),
});

function resolveExtractOlidModels({
  model,
  models,
}: {
  model: string;
  models?: z.infer<NonNullable<typeof ExtractOlidModelsPayload>>;
}): ExtractOlidModels {
  const modelParts = model
    .split(":")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const getModel = (phase: number) =>
    modelParts[phase] ?? modelParts[modelParts.length - 1] ?? DEFAULT_MODEL;

  return [
    models?.phase1 ?? getModel(0),
    models?.phase2 ?? getModel(1),
    models?.phase3 ?? getModel(2),
    models?.phase4 ?? getModel(3),
  ];
}

export const extractOlidTask = schemaTask({
  id: "extract-olid",
  schema: ExtractOlidPayload,
  machine: "micro",
  run: async ({ imageId, model, models: configuredModels, save }) => {
    const models = resolveExtractOlidModels({
      model,
      models: configuredModels,
    });
    const imageUrl = `${IMAGE_URL_PREFIX}/jpeg/640/${imageId}.jpg`;

    console.log(`Processing image: ${imageId}`);

    const { ocrText, usage: usage1 } = await triggerAndWait({
      task: extractOlidPhase1Task,
      payload: { imageUrl, model: models[0] },
    });

    const {
      phase2Messages,
      phase2FinalContent,
      usage: usage2,
    } = await triggerAndWait({
      task: extractOlidPhase2Task,
      payload: {
        ocrText,
        model: models[1],
      },
    });

    const { phase3FinalContent, usage: usage3 } = await triggerAndWait({
      task: extractOlidPhase3Task,
      payload: {
        ocrText,
        phase2Messages,
        phase2FinalContent,
        model: models[2],
      },
    });

    const { result, usage: usage4 } = await triggerAndWait({
      task: extractOlidPhase4Task,
      payload: { phase3FinalContent, model: models[3] },
    });

    const totalCost = usage1.cost + usage2.cost + usage3.cost + usage4.cost;
    console.log(`Total cost: $${totalCost.toFixed(8)}`);

    if (save && result) {
      const { sql, sqlTools } = getDbWriteConnection(env);
      try {
        await sqlTools.query`
          UPDATE image
          SET openlibrary_work_id = ${result.openlibrary_work_id},
              openlibrary_work_id_confidence = ${result.evidence},
              openlibrary_work_id_model = ${models.join(":")}
          WHERE id = ${imageId}
        `;
        console.log(
          `Saved: ${imageId} → OLID ${result.openlibrary_work_id ?? "null"} (${result.evidence})`,
        );
      } finally {
        await sql.end();
      }
    }

    return {
      result,
      cost: totalCost,
      usage: {
        phase1: usage1,
        phase2: usage2,
        phase3: usage3,
        phase4: usage4,
      },
    };
  },
});

export const extractOlidBatchTask = schemaTask({
  id: "extract-olid-batch",
  schema: ExtractOlidBatchPayload,
  machine: "micro",
  maxDuration: 12 * 60 * 60,
  retry: {
    maxAttempts: 1,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async ({
    model,
    models: configuredModels,
    save,
    limit,
    tablesample,
  }) => {
    const { sql, sqlTools } = getDbWriteConnection(env);
    try {
      const rows = await sqlTools.many(ImageIdRow)`
        SELECT id::text AS id
        FROM image
        ${tablesample === undefined ? sql`` : sql`TABLESAMPLE BERNOULLI(${tablesample})`}
        WHERE openlibrary_work_id IS NULL
          AND deleted = false
        ORDER BY id
        ${limit === undefined ? sql`` : sql`LIMIT ${limit}`}
      `;

      console.log(`Found ${rows.length} images missing OpenLibrary work IDs`);

      const batchItems = rows.map((row) => ({
        task: extractOlidTask,
        payload: {
          imageId: row.id,
          model,
          models: configuredModels,
          save,
        },
      }));
      const runs = await batchTriggerAndWaitSettled(batchItems);
      const outputs = runs.flatMap((run) => {
        if (run.ok) {
          return [run.output];
        }

        return [];
      });
      const failed = runs.flatMap((run, index) => {
        if (run.ok) {
          return [];
        }

        const imageId = batchItems[index]?.payload.imageId ?? "unknown";
        const message =
          run.error instanceof Error ? run.error.message : String(run.error);

        console.error(`Failed to extract OLID for ${imageId}: ${message}`);

        return [
          {
            imageId,
            error: message,
          },
        ];
      });
      const totalCost = outputs.reduce((sum, output) => {
        return sum + output.cost;
      }, 0);
      const averageCostPerId =
        outputs.length === 0 ? 0 : totalCost / outputs.length;
      const estimatedCostPer1000Ids = averageCostPerId * 1000;

      console.log(
        `Images indexed: ${outputs.length} | Total cost: $${totalCost.toFixed(8)} | average cost per id: $${averageCostPerId.toFixed(8)} | estimated cost per 1k ids: $${estimatedCostPer1000Ids.toFixed(2)}`,
      );

      return {
        requestedCount: rows.length,
        succeededCount: outputs.length,
        completedCount: outputs.length,
        failedCount: failed.length,
        totalCost,
        averageCostPerId,
        estimatedCostPer1000Ids,
        failed,
        results: outputs,
      };
    } finally {
      await sql.end();
    }
  },
});
