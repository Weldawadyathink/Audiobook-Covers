import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { callOpenRouter, type PhaseUsage } from "./extract-olid-utils";

const Phase1Payload = z.object({
  imageUrl: z.string(),
  model: z.string(),
});

export const extractOlidPhase1Task = schemaTask({
  id: "extract-olid-phase1",
  schema: Phase1Payload,
  machine: "small-1x",
  run: async ({ imageUrl, model }) => {
    const response = await callOpenRouter(
      [
        {
          role: "system",
          content:
            "You are an OCR engine. Extract all visible text from images verbatim. Output raw text only — no markdown, no formatting, no commentary.",
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
            {
              type: "text",
              text: "Extract all visible text from this audiobook cover image. Include the title, subtitle, author name, series name, and any other text you can see. Return only the extracted text, nothing else.",
            },
          ],
        },
      ],
      model,
    );

    const ocrText = response.choices[0]?.message?.content;
    if (!ocrText) throw new Error("Phase 1 OCR returned empty content");

    const usage: PhaseUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      cost: response.usage?.cost ?? 0,
    };

    console.log(
      `Phase 1 cost: $${usage.cost.toFixed(8)} | tokens in: ${usage.promptTokens.toLocaleString()} out: ${usage.completionTokens.toLocaleString()}`,
    );

    return { ocrText, usage };
  },
});
