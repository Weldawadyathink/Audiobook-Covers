import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getDbWriteConnection } from "@/db";
import { env } from "@/env";
import { triggerAndWait } from "../utils";
import { extractOlidPhase1Task } from "./phase1";
import { extractOlidPhase2Task } from "./phase2";
import { extractOlidPhase3Task } from "./phase3";
import { extractOlidPhase4Task } from "./phase4";

const IMAGE_URL_PREFIX = "https://images.audiobookcovers.com";

const ExtractOlidPayload = z.object({
  imageId: z.string(),
  model: z.string().optional().default("google/gemini-2.5-flash-lite"),
  save: z.boolean().optional().default(false),
});

export const extractOlidTask = schemaTask({
  id: "extract-olid",
  schema: ExtractOlidPayload,
  machine: "micro",
  run: async ({ imageId, model, save }) => {
    const modelParts = model.split(":").map((s) => s.trim());
    const getModel = (phase: number) =>
      modelParts[phase] ?? modelParts[modelParts.length - 1];
    const models: [string, string, string, string] = [
      getModel(0),
      getModel(1),
      getModel(2),
      getModel(3),
    ];
    const imageUrl = `${IMAGE_URL_PREFIX}/jpeg/640/${imageId}.jpg`;

    console.log(`Processing image: ${imageId}`);

    const { ocrText, usage: usage1 } = await triggerAndWait(
      extractOlidPhase1Task,
      { imageUrl, model: models[0] },
    );

    const { phase2Messages, phase2FinalContent, usage: usage2 } =
      await triggerAndWait(extractOlidPhase2Task, {
        imageUrl,
        ocrText,
        model: models[1],
      });

    const { phase3FinalContent, usage: usage3 } = await triggerAndWait(
      extractOlidPhase3Task,
      {
        imageUrl,
        ocrText,
        phase2Messages,
        phase2FinalContent,
        model: models[2],
      },
    );

    const { result, usage: usage4 } = await triggerAndWait(
      extractOlidPhase4Task,
      { phase3FinalContent, model: models[3] },
    );

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

    return { result };
  },
});
