import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  callOpenRouter,
  parseSearchOpenLibraryToolArguments,
  searchOpenLibrary,
  phase3SystemPrompt,
  validateOpenLibraryTool,
  type OpenRouterMessage,
  type PhaseUsage,
} from "./utils";

const Phase3Payload = z.object({
  ocrText: z.string(),
  phase2Messages: z.array(z.any()),
  phase2FinalContent: z.string(),
  model: z.string(),
});

const MAX_PHASE3_SEARCH_CALLS = 5;

export const extractOlidPhase3Task = schemaTask({
  id: "extract-olid-phase3",
  schema: Phase3Payload,
  machine: "small-2x",
  run: async ({
    ocrText,
    phase2Messages: rawPhase2Messages,
    phase2FinalContent,
    model,
  }) => {
    const phase2Messages = rawPhase2Messages as OpenRouterMessage[];

    // Build phase 3 messages: system prompt + phase 2 messages (minus user message) + phase 2 final + analysis request
    const phase3Messages: OpenRouterMessage[] = [
      { role: "system", content: phase3SystemPrompt },
      ...phase2Messages.slice(1),
      { role: "assistant", content: phase2FinalContent },
      {
        role: "user",
        content: `The original cover OCR text was:\n\n${ocrText}\n\nBased on the research above, please analyze the candidates and select the best match. Discuss the strengths and weaknesses of this identification, your confidence level, and provide all available metadata for the selected book.`,
      },
    ];

    let phase3FinalContent = "";
    const usage: PhaseUsage = {
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
    };
    let searchCallCount = 0;
    let forceFinalAnswer = false;

    while (true) {
      const response = await callOpenRouter(
        phase3Messages,
        model,
        forceFinalAnswer ? undefined : [validateOpenLibraryTool],
      );
      usage.promptTokens += response.usage?.prompt_tokens ?? 0;
      usage.completionTokens += response.usage?.completion_tokens ?? 0;
      usage.cost += response.usage?.cost ?? 0;

      const message = response.choices[0]?.message;
      if (!message) break;

      const toolCalls = message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        phase3FinalContent = message.content ?? "";
        break;
      }

      phase3Messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (toolCall.function.name !== "search_openlibrary") continue;

        if (searchCallCount >= MAX_PHASE3_SEARCH_CALLS) {
          phase3Messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              "Search limit reached. Use the validation results already gathered and provide your final analysis now.",
          });
          forceFinalAnswer = true;
          continue;
        }

        const { query, limit } = parseSearchOpenLibraryToolArguments(
          toolCall.function.arguments,
        );
        const searchResultJson = await searchOpenLibrary(query, limit);
        searchCallCount++;

        phase3Messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: searchResultJson,
        });
      }
    }

    console.log(
      `Phase 3 cost: $${usage.cost.toFixed(8)} | tokens in: ${usage.promptTokens.toLocaleString()} out: ${usage.completionTokens.toLocaleString()}`,
    );

    return { phase3FinalContent, usage };
  },
});
