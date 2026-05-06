import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { jsonrepair } from "jsonrepair";
import ky from "ky";
import { env } from "@/env";
import { Elastic } from "../elastic";

// --- Types ---

export type OpenRouterMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
        | { type: "tool_result"; tool_use_id: string; content: string }
      >;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type OpenRouterResponse = {
  id: string;
  choices: Array<{
    finish_reason: string | null;
    native_finish_reason?: string | null;
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
};

export type PhaseUsage = {
  promptTokens: number;
  completionTokens: number;
  cost: number;
};

// --- Schema ---

export const OpenlibraryWorkIdExtractionResultSchema = z.object({
  openlibrary_work_id: z
    .string()
    .nullable()
    .describe("OpenLibrary work ID (e.g. OL1234W), null if no match"),
  evidence: z
    .enum(["CONFIRMED", "LIKELY", "UNCERTAIN", "NO_MATCH"])
    .describe("CONFIRMED | LIKELY | UNCERTAIN | NO_MATCH"),
  title: z.string().nullable().describe("Title of the matched book"),
  authors: z
    .array(z.string())
    .nullable()
    .describe("Authors of the matched book"),
});

export type OpenlibraryWorkIdExtractionResult = z.infer<
  typeof OpenlibraryWorkIdExtractionResultSchema
>;

export const openlibraryWorkIdResultJsonSchema = zodToJsonSchema(
  OpenlibraryWorkIdExtractionResultSchema,
  { $refStrategy: "none" },
);

// --- Helpers ---

export function parseOpenlibraryWorkIdResult(
  raw: string,
): OpenlibraryWorkIdExtractionResult | null {
  try {
    return OpenlibraryWorkIdExtractionResultSchema.parse(JSON.parse(raw));
  } catch {
    // fall through to repair
  }
  try {
    return OpenlibraryWorkIdExtractionResultSchema.parse(
      JSON.parse(jsonrepair(raw)),
    );
  } catch {
    return null;
  }
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  phaseModel: string,
  tools?: object[],
  responseFormat?: object,
): Promise<OpenRouterResponse> {
  let attempt = 0;
  while (true) {
    let response: OpenRouterResponse;
    try {
      response = await ky
        .post("https://openrouter.ai/api/v1/chat/completions", {
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          json: {
            model: phaseModel,
            messages,
            ...(tools ? { tools } : {}),
            ...(responseFormat ? { response_format: responseFormat } : {}),
          },
          timeout: 120_000,
          throwHttpErrors: true,
          retry: { limit: 0 },
        })
        .json<OpenRouterResponse>();
    } catch (err: unknown) {
      const status =
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status;
      const isRateLimited = status === 429;
      const isTransient =
        status === 500 || status === 502 || status === 503 || status === 504;

      if (isRateLimited || isTransient) {
        console.warn(
          `OpenRouter API ${status} — retrying (attempt ${attempt + 1})...`,
        );
        attempt++;
        continue;
      }
      throw err;
    }

    const choice = response.choices[0];
    const finishReason = choice?.finish_reason;
    const nativeFinishReason = choice?.native_finish_reason;

    if (nativeFinishReason === "MALFORMED_FUNCTION_CALL") {
      attempt++;
      if (attempt > 10) {
        throw new Error(
          `OpenRouter returned MALFORMED_FUNCTION_CALL after ${attempt} attempts`,
        );
      }
      console.debug(
        `OpenRouter returned MALFORMED_FUNCTION_CALL — retrying (attempt ${attempt})...`,
      );
      continue;
    }

    if (finishReason === "error") {
      attempt++;
      if (attempt > 5) {
        throw new Error(
          `OpenRouter returned finish_reason=${finishReason}:${nativeFinishReason} after ${attempt} attempts`,
        );
      }
      console.debug(
        `OpenRouter returned finish_reason=${finishReason}:${nativeFinishReason} — retrying (attempt ${attempt})...`,
      );
      continue;
    }
    return response;
  }
}

// --- OpenLibrary search ---

let elastic: Elastic | null = null;

function getElastic() {
  elastic ??= new Elastic();
  return elastic;
}

export function parseSearchOpenLibraryToolArguments(argumentsJson: string) {
  try {
    const args = JSON.parse(argumentsJson);
    return {
      query: typeof args.query === "string" ? args.query : "",
      limit: typeof args.limit === "number" ? args.limit : undefined,
    };
  } catch {
    return { query: argumentsJson, limit: undefined };
  }
}

export async function searchOpenLibrary(
  query: string,
  limit = 10,
): Promise<string> {
  console.log(`  [tool] search_openlibrary: "${query}"`);

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return JSON.stringify({ totalItems: 0, results: [] });
  }

  const results = await getElastic().searchOpenLibraryWorks(
    trimmedQuery,
    limit,
  );

  console.log(`  [extract-olid] found ${results.length} results`);
  return JSON.stringify({ totalItems: results.length, results });
}

// --- Prompts ---

export const phase2SystemPrompt = `You are a book identification assistant. Your goal is to look for book entries in the OpenLibrary database that may match the audiobook cover image. Do not state or imply a conclusion before completing your searches. Begin tool calls immediately. Respond in plain text without emoji or markdown.

You will be given:
1. The audiobook cover image
2. OCR text extracted from the cover

Your task:
1. Analyze the cover image and OCR text to identify the book title, series, and any other identifying information
2. Brainstorm multiple possible search queries to find the correct book
3. Use the search_openlibrary tool multiple times to gather metadata for candidate matches
4. For each search, you will receive work-level metadata enriched with edition-derived signals including title aliases, author names, publishers, languages, publication years, edition counts, and OpenLibrary work IDs. Use this metadata for identification and to avoid sparse duplicate records.
5. Collect all relevant metadata found across your searches, including OpenLibrary work IDs (olid)

Important: The search tool is work-centric. It can match title, series, subtitle, and author text, but the returned identifier is always an OpenLibrary work ID.

Your goal is to find candidate books. The initial image is for an audiobook, but that is irrelevant to your task. You do not need to find an audiobook edition, a standard edition will do.

Be thorough: try variations of the title and series. Explore multiple candidates before concluding. For broad, ambiguous, or common-title searches, request a larger result limit.`;

export const phase3SystemPrompt = `You are a book identification expert performing final analysis.
You will receive:
1. The original audiobook cover image
2. OCR text extracted from the cover (Phase 1)
3. The full research session from an agentic search for candidates: all OpenLibrary searches performed and their results

Your task:
1. Review the candidates found in Phase 2 and determine the single best work-level match for this audiobook cover. Prefer the canonical work record rather than a sparse duplicate or adaptation.
2. If you need to confirm metadata for a specific candidate (e.g. verify a work ID, publication window, or author), you may use the search_openlibrary tool — but only to validate an existing candidate, NOT to explore new ones
3. Write a thorough analysis that includes:
   - Why this candidate is the best match (evidence from the cover image, OCR text, and search results)
   - Any weaknesses or uncertainties in the match (ambiguous text, multiple editions, common titles, etc.)
   - The evidence classification (see below) and the reasoning behind it
   - All known metadata for the selected book: title, subjects, OpenLibrary work ID, publication date or publication window, description, and any alias or author evidence that helped disambiguate duplicate records
4. Be honest about uncertainty — if no good match was found, say so clearly

Note: Author names are available in search results and may be used to confirm a match.

Evidence Classification:
Classify the strength of your evidence using exactly one of these three labels:

CONFIRMED — Both OCR and OpenLibrary agree. Title was clearly extracted from the cover and matches a specific work in OpenLibrary without ambiguity.

LIKELY — Strong signal but incomplete. OCR recovered enough text to make a confident identification, and OpenLibrary returned a plausible match, but at least one of the following is true: OCR had unclear characters or partial text, the title is common enough that other books could match, or the OpenLibrary result required inference rather than direct confirmation.

UNCERTAIN — Weak or conflicting evidence. OCR recovered little usable text, no OpenLibrary result matched convincingly, signals from the cover and search results conflict, or the best candidate is a guess rather than a supported conclusion.

NO_MATCH — No clear match was found. The evidence suggests the title is not recognizable, or the book is not in OpenLibrary.`;

export const phase4SystemPrompt =
  "You are a structured data extractor. You will receive a book identification analysis. Extract the recommended OpenLibrary work ID and evidence classification into the required JSON format. If the analysis concluded no match was found, set openlibrary_work_id to null and evidence to NO_MATCH.";

// --- Tool definitions ---

export const searchOpenLibraryTool = {
  type: "function",
  function: {
    name: "search_openlibrary",
    description:
      "Search the enriched OpenLibrary works database for book metadata. Use this to look up candidate works by title, subtitle, series text, or author text. Results include author names, title aliases, publisher/language hints, edition counts, and the OpenLibrary work ID.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Book search string (for example a title, title plus author, or series phrase).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          description:
            "Maximum number of ranked results to return. Use 10 by default; use up to 25 for broad or ambiguous searches.",
        },
      },
      required: ["query"],
    },
  },
};

export const validateOpenLibraryTool = {
  type: "function",
  function: {
    name: "search_openlibrary",
    description:
      "Look up a specific book in the enriched OpenLibrary works database to validate or confirm an existing candidate. Use this ONLY to verify metadata for a candidate already identified in the previous search phase — not to find new candidates.",
    parameters: searchOpenLibraryTool.function.parameters,
  },
};
