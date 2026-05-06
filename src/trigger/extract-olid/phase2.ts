import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  callOpenRouter,
  parseSearchOpenLibraryToolArguments,
  searchOpenLibrary,
  phase2SystemPrompt,
  searchOpenLibraryTool,
  type OpenRouterMessage,
  type PhaseUsage,
} from "./utils";

const Phase2Payload = z.object({
  imageUrl: z.string(),
  ocrText: z.string(),
  model: z.string(),
});

export const extractOlidPhase2Task = schemaTask({
  id: "extract-olid-phase2",
  schema: Phase2Payload,
  machine: "small-2x",
  run: async ({ imageUrl, ocrText, model }) => {
    const phase2Messages: OpenRouterMessage[] = [
      { role: "system", content: phase2SystemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
          {
            type: "text",
            text: `Here is the audiobook cover image. The OCR text extracted from it is:\n\n${ocrText}\n\nPlease search OpenLibrary to find the correct book entry for this audiobook cover.`,
          },
        ],
      },
    ];

    let phase2FinalContent = "";
    const usage: PhaseUsage = {
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
    };

    while (true) {
      const response = await callOpenRouter(phase2Messages, model, [
        searchOpenLibraryTool,
      ]);
      usage.promptTokens += response.usage?.prompt_tokens ?? 0;
      usage.completionTokens += response.usage?.completion_tokens ?? 0;
      usage.cost += response.usage?.cost ?? 0;

      const message = response.choices[0]?.message;
      if (!message) break;

      const toolCalls = message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        phase2FinalContent = message.content ?? "";
        break;
      }

      phase2Messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (toolCall.function.name !== "search_openlibrary") continue;

        const { query, limit } = parseSearchOpenLibraryToolArguments(
          toolCall.function.arguments,
        );
        const searchResultJson = await searchOpenLibrary(query, limit);

        phase2Messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: searchResultJson,
        });
      }
    }

    console.log(
      `Phase 2 cost: $${usage.cost.toFixed(8)} | tokens in: ${usage.promptTokens.toLocaleString()} out: ${usage.completionTokens.toLocaleString()}`,
    );

    return { phase2Messages, phase2FinalContent, usage };
  },
});
