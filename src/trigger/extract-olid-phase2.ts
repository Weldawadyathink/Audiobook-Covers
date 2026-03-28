import { schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import {
  callOpenRouter,
  ensureEnrichedWorksParquetCached,
  searchOpenLibraryByTitle,
  phase2SystemPrompt,
  searchOpenLibraryTool,
  type OpenRouterMessage,
  type PhaseUsage,
} from "./extract-olid-utils";

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
    const tmpDir = "/tmp/extract-olid";
    fs.mkdirSync(`${tmpDir}/home`, { recursive: true });
    fs.mkdirSync(`${tmpDir}/temp`, { recursive: true });

    const db = await DuckDBInstance.create(":memory:");
    const con = await db.connect();

    try {
      await con.run(`SET memory_limit = '500MB'`);
      await con.run(`SET home_directory='${tmpDir}/home'`);
      await con.run(`SET temp_directory='${tmpDir}/temp'`);

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

      let parquetReady = false;

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

          // Lazy parquet download: only on first tool call
          if (!parquetReady) {
            await ensureEnrichedWorksParquetCached();
            parquetReady = true;
          }

          let query = "";
          try {
            query = JSON.parse(toolCall.function.arguments).query ?? "";
          } catch {
            query = toolCall.function.arguments;
          }

          const searchResultJson = await searchOpenLibraryByTitle(con, query);

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
    } finally {
      con.closeSync();
      db.closeSync();
    }
  },
});
