import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  callOpenRouter,
  parseOpenlibraryWorkIdResult,
  openlibraryWorkIdResultJsonSchema,
  phase4SystemPrompt,
  type PhaseUsage,
} from "./extract-olid-utils";

const Phase4Payload = z.object({
  phase3FinalContent: z.string(),
  model: z.string(),
});

export const extractOlidPhase4Task = schemaTask({
  id: "extract-olid-phase4",
  schema: Phase4Payload,
  machine: "small-1x",
  run: async ({ phase3FinalContent, model }) => {
    const response = await callOpenRouter(
      [
        { role: "system", content: phase4SystemPrompt },
        { role: "user", content: phase3FinalContent },
      ],
      model,
      undefined,
      {
        type: "json_schema",
        json_schema: {
          name: "openlibrary_work_id_extraction_result",
          strict: true,
          schema: openlibraryWorkIdResultJsonSchema,
        },
      },
    );

    const raw = response.choices[0]?.message?.content ?? "";
    const result = parseOpenlibraryWorkIdResult(raw);

    if (!result) {
      console.warn("Phase 4 failed to produce valid structured output. Raw response:", raw);
    } else {
      console.log(
        `Phase 4 result: OLID ${result.openlibrary_work_id ?? "null"} (${result.evidence}) — "${result.title ?? "unknown"}"`,
      );
    }

    const usage: PhaseUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      cost: response.usage?.cost ?? 0,
    };

    console.log(
      `Phase 4 cost: $${usage.cost.toFixed(8)} | tokens in: ${usage.promptTokens.toLocaleString()} out: ${usage.completionTokens.toLocaleString()}`,
    );

    return { result, usage };
  },
});
