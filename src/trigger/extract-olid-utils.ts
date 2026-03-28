import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { jsonrepair } from "jsonrepair";
import ky from "ky";
import * as fs from "fs";
import { env } from "@/env";
import { makeS3Client, headS3Object, downloadS3File } from "./openlibrary-utils";

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

// --- Parquet cache ---

const LOCAL_PARQUET_PATH =
  "/tmp/extract-olid/enriched_works_local.parquet";
const LOCAL_META_PATH =
  "/tmp/extract-olid/enriched_works_local.meta.json";
const S3_PARQUET_KEY = "openlibrary/enriched_works.parquet";

interface EnrichedWorksParquetMeta {
  etag: string;
  contentLength: number;
}

export async function ensureEnrichedWorksParquetCached(): Promise<void> {
  const s3 = makeS3Client();
  const s3Head = await headS3Object(s3, S3_PARQUET_KEY);
  if (!s3Head) throw new Error("enriched_works.parquet not found in S3");

  fs.mkdirSync("/tmp/extract-olid", { recursive: true });

  const localExists = fs.existsSync(LOCAL_PARQUET_PATH);
  const metaExists = fs.existsSync(LOCAL_META_PATH);

  if (localExists && metaExists) {
    const meta: EnrichedWorksParquetMeta = JSON.parse(
      fs.readFileSync(LOCAL_META_PATH, "utf-8"),
    );
    if (
      meta.etag === s3Head.etag &&
      meta.contentLength === s3Head.contentLength
    ) {
      console.log("Using cached enriched_works.parquet");
      return;
    }
    console.log("enriched_works.parquet cache stale, re-downloading...");
  } else {
    console.log("Downloading enriched_works.parquet from S3...");
  }

  await downloadS3File(s3, S3_PARQUET_KEY, LOCAL_PARQUET_PATH);

  const newMeta: EnrichedWorksParquetMeta = {
    etag: s3Head.etag,
    contentLength: s3Head.contentLength,
  };
  fs.writeFileSync(LOCAL_META_PATH, JSON.stringify(newMeta));
  console.log("enriched_works.parquet downloaded and cached");
}

// Minimal structural interface for a DuckDB connection
interface DuckDBLike {
  run(sql: string): Promise<{ getRows(): Promise<Array<Array<unknown>>> }>;
}

export async function searchOpenLibraryByTitle(
  con: DuckDBLike,
  query: string,
): Promise<string> {
  console.log(`  [tool] search_openlibrary: "${query}"`);

  const escapedQuery = query.replace(/'/g, "''");
  const result = await con.run(`
    SELECT
      e.olid, e.title, e.subtitle,
      list(DISTINCT e.name) FILTER (WHERE e.name IS NOT NULL) AS author_names,
      list_distinct(flatten(list(coalesce(e.alternate_names, []::VARCHAR[])))) AS author_alternate_names,
      e.subjects, e.description, e.first_publish_date, e.other_titles
    FROM read_parquet('${LOCAL_PARQUET_PATH}') e
    WHERE e.title ILIKE '%${escapedQuery}%'
    GROUP BY e.olid, e.title, e.subtitle, e.subjects, e.description, e.first_publish_date, e.other_titles
    LIMIT 10
  `);

  const rows = await result.getRows();
  const columns = [
    "olid",
    "title",
    "subtitle",
    "author_names",
    "author_alternate_names",
    "subjects",
    "description",
    "first_publish_date",
    "other_titles",
  ];

  const results = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    if (
      Array.isArray(obj.author_alternate_names) &&
      (obj.author_alternate_names as unknown[]).length === 0
    ) {
      delete obj.author_alternate_names;
    }
    return obj;
  });

  console.log(`  [extractOLID] found ${results.length} results`);
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
4. For each search, you will receive book metadata including title, subtitle, author names, subjects, description, and OpenLibrary work IDs. Use this metadata for identification.
5. Collect all relevant metadata found across your searches, including OpenLibrary work IDs (olid)

Important: OpenLibrary only supports title-based search. You cannot search by author name — use title variations only.

Your goal is to find candidate books. The initial image is for an audiobook, but that is irrelevant to your task. You do not need to find an audiobook edition, a standard edition will do.

Be thorough: try variations of the title and series. Explore multiple candidates before concluding.`;

export const phase3SystemPrompt = `You are a book identification expert performing final analysis.
You will receive:
1. The original audiobook cover image
2. OCR text extracted from the cover (Phase 1)
3. The full research session from an agentic search for candidates: all OpenLibrary searches performed and their results

Your task:
1. Review the candidates found in Phase 2 and determine the single best match for this audiobook cover. Prefer the primary edition or earliest printing.
2. If you need to confirm metadata for a specific candidate (e.g. verify a work ID or publication date), you may use the search_openlibrary tool — but only to validate an existing candidate, NOT to explore new ones
3. Write a thorough analysis that includes:
   - Why this candidate is the best match (evidence from the cover image, OCR text, and search results)
   - Any weaknesses or uncertainties in the match (ambiguous text, multiple editions, common titles, etc.)
   - The evidence classification (see below) and the reasoning behind it
   - All known metadata for the selected book: title, subjects, OpenLibrary work ID, publication date, description
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
      "Search the OpenLibrary works database for book metadata. Use this to look up potential matches by title. Results include resolved author names. Searches must be title-based — author name search is not supported.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Title search string (e.g. 'The Name of the Wind'). Only title-based search is supported.",
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
      "Look up a specific book in the OpenLibrary database to validate or confirm an existing candidate. Use this ONLY to verify metadata (work ID, publication date, subjects, author names) for a candidate already identified in the previous search phase — not to find new candidates.",
    parameters: searchOpenLibraryTool.function.parameters,
  },
};
