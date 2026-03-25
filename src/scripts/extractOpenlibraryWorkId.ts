import { Command } from "commander";
import { getDbWriteConnection } from "@/server/db";
import {
  DBImageDataValidator,
  shapeImageData,
  shapeImageDataArray,
} from "@/server/imageData";
import { getEnv } from "@/server/env";
import ky from "ky";
import "dotenv/config";
import { logger } from "@/server/logger";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { jsonrepair } from "jsonrepair";
import pLimit from "p-limit";
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import * as https from "https";

// Suppress logs from other modules until we set the level from CLI flags
logger.setLogLevel("disabled");

const program = new Command();

program
  .option("-i, --image-id <uuid>", "The image ID to process")
  .option(
    "-m, --model <text>",
    "The OpenRouter model(s) to use. Use : to specify different models per phase (e.g. 'phase1model:phase2model')",
    "google/gemini-2.5-flash-lite",
  )
  .option("--save", "Save results to the database")
  .option(
    "-s, --tablesample <number>",
    "Process a random sample of images missing an OpenLibrary work ID (percentage)",
  )
  .option("--complete", "Process all images missing an OpenLibrary work ID")
  .option(
    "-l, --log-level <level>",
    "Log level: debug | info | warn | error",
    "info",
  )
  .option(
    "-t, --threads <number>",
    "Number of images to process in parallel",
    "1",
  )
  .option(
    "--cache",
    "Download the OpenLibrary parquet to /tmp/ol_works.parquet and query it locally (faster for bulk runs)",
  );

program.parse(process.argv);

const imageId: string | undefined = program.opts().imageId;
const model: string = program.opts().model;
const save: boolean = program.opts().save ?? false;
const tablesample: string | undefined = program.opts().tablesample;
const complete: boolean = program.opts().complete ?? false;
const logLevel: string = program.opts().logLevel ?? "info";
const threads: number = parseInt(program.opts().threads, 10);
const useCache: boolean = program.opts().cache ?? false;

logger.setLogLevel(logLevel as Parameters<typeof logger.setLogLevel>[0]);

if (!imageId && !tablesample && !complete) {
  console.error("Must provide --image-id, --tablesample, or --complete");
  process.exit(1);
}
if (imageId && (tablesample || complete)) {
  console.error("Cannot use --image-id with --tablesample or --complete");
  process.exit(1);
}

const modelParts = model.split(":").map((s: string) => s.trim());
const getModel = (phase: number) =>
  modelParts[phase] ?? modelParts[modelParts.length - 1];

const env = getEnv();
const { sql, sqlTools } = getDbWriteConnection();

// --- Phase 4 schema ---

const OpenlibraryWorkIdExtractionResultSchema = z.object({
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

type OpenlibraryWorkIdExtractionResult = z.infer<
  typeof OpenlibraryWorkIdExtractionResultSchema
>;

const openlibraryWorkIdResultJsonSchema = zodToJsonSchema(
  OpenlibraryWorkIdExtractionResultSchema,
  { $refStrategy: "none" },
);

function parseOpenlibraryWorkIdResult(
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

// ---

type OpenRouterMessage = {
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

type OpenRouterResponse = {
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

function extractCost(response: OpenRouterResponse): number {
  return response.usage?.cost ?? 0;
}

type PhaseUsage = {
  promptTokens: number;
  completionTokens: number;
  cost: number;
};

function printPhaseUsage(phase: number, u: PhaseUsage): void {
  logger.debug(
    `Phase ${phase} cost: $${u.cost.toFixed(8)} | tokens in: ${u.promptTokens.toLocaleString()} out: ${u.completionTokens.toLocaleString()}`,
  );
}

let totalCost = 0;

async function callOpenRouter(
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
        logger.warn(
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
      logger.debug(
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
      logger.debug(
        `OpenRouter returned finish_reason=${finishReason}:${nativeFinishReason} — retrying (attempt ${attempt})...`,
      );
      continue;
    }
    return response;
  }
}

// --- OpenLibrary parquet setup ---

const OL_PARQUET_URL =
  "https://images.audiobookcovers.com/openlibrary/works.parquet";
const OL_PARQUET_PATH = "/tmp/ol_works.parquet";

async function downloadParquet(): Promise<void> {
  if (fs.existsSync(OL_PARQUET_PATH)) {
    const validateDb = await DuckDBInstance.create(":memory:");
    const validateCon = await validateDb.connect();
    try {
      await validateCon.run(`SELECT count(*) FROM read_parquet('${OL_PARQUET_PATH}')`);
      logger.debug(`OpenLibrary parquet already cached at ${OL_PARQUET_PATH}`);
      return;
    } catch {
      logger.warn(`Cached parquet at ${OL_PARQUET_PATH} is invalid, re-downloading...`);
      fs.unlinkSync(OL_PARQUET_PATH);
    } finally {
      validateCon.closeSync();
      validateDb.closeSync();
    }
  }
  logger.info(`Downloading OpenLibrary works parquet to ${OL_PARQUET_PATH}...`);
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(OL_PARQUET_PATH);
    https
      .get(OL_PARQUET_URL, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download parquet: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      })
      .on("error", reject);
  });
  logger.info("Download complete.");
}

if (useCache) {
  await downloadParquet();
}

const parquetSource = useCache ? OL_PARQUET_PATH : OL_PARQUET_URL;

const db = await DuckDBInstance.create(":memory:");
const con = await db.connect();

if (!useCache) {
  await con.run("SET home_directory='/tmp'");
  await con.run("INSTALL httpfs");
  await con.run("LOAD httpfs");
}

async function searchOpenLibrary(query: string): Promise<string> {
  logger.debug(`  [tool] search_openlibrary: "${query}"`);

  const escapedQuery = query.replace(/'/g, "''");
  const result = await con.run(`
    SELECT olid, title, subtitle, authors, subjects, description, first_publish_date, other_titles
    FROM read_parquet('${parquetSource}')
    WHERE title ILIKE '%${escapedQuery}%'
    LIMIT 10
  `);

  const rows = await result.getRows();
  const columns = [
    "olid",
    "title",
    "subtitle",
    "authors",
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
    return obj;
  });

  return JSON.stringify({ totalItems: results.length, results });
}

const searchOpenLibraryTool = {
  type: "function",
  function: {
    name: "search_openlibrary",
    description:
      "Search the OpenLibrary works database for book metadata. Use this to look up potential matches by title. Note: author names are not available — only author keys (e.g. /authors/OL123A) are stored. Searches must be title-based.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Title search string (e.g. 'The Name of the Wind'). Author names cannot be searched — use title variations only.",
        },
      },
      required: ["query"],
    },
  },
};

const validateOpenLibraryTool = {
  type: "function",
  function: {
    name: "search_openlibrary",
    description:
      "Look up a specific book in the OpenLibrary database to validate or confirm an existing candidate. Use this ONLY to verify metadata (work ID, publication date, subjects) for a candidate already identified in the previous search phase — not to find new candidates. Note: author names are not available, only author keys.",
    parameters: searchOpenLibraryTool.function.parameters,
  },
};

const phase2SystemPrompt = `You are a book identification assistant. Your goal is to look for book entries in the OpenLibrary database that may match the audiobook cover image. Do not state or imply a conclusion before completing your searches. Begin tool calls immediately. Respond in plain text without emoji or markdown.

You will be given:
1. The audiobook cover image
2. OCR text extracted from the cover

Your task:
1. Analyze the cover image and OCR text to identify the book title, series, and any other identifying information
2. Brainstorm multiple possible search queries to find the correct book
3. Use the search_openlibrary tool multiple times to gather metadata for candidate matches
4. For each search, you will receive book metadata including title, subtitle, subjects, description, and OpenLibrary work IDs. Use this metadata for identification.
5. Collect all relevant metadata found across your searches, including OpenLibrary work IDs (olid)

Important: OpenLibrary only supports title-based search. Author names are not available in the database — only author keys (e.g. /authors/OL123A) are stored. Do not attempt to search by author name.

Your goal is to find candidate books. The initial image is for an audiobook, but that is irrelevant to your task. You do not need to find an audiobook edition, a standard edition will do.

Be thorough: try variations of the title and series. Explore multiple candidates before concluding.`;

const phase3SystemPrompt = `You are a book identification expert performing final analysis.
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

Note: Author names are not available in OpenLibrary parquet data — only author keys. Do not rely on author name confirmation.

Evidence Classification:
Classify the strength of your evidence using exactly one of these three labels:

CONFIRMED — Both OCR and OpenLibrary agree. Title was clearly extracted from the cover and matches a specific work in OpenLibrary without ambiguity.

LIKELY — Strong signal but incomplete. OCR recovered enough text to make a confident identification, and OpenLibrary returned a plausible match, but at least one of the following is true: OCR had unclear characters or partial text, the title is common enough that other books could match, or the OpenLibrary result required inference rather than direct confirmation.

UNCERTAIN — Weak or conflicting evidence. OCR recovered little usable text, no OpenLibrary result matched convincingly, signals from the cover and search results conflict, or the best candidate is a guess rather than a supported conclusion.

NO_MATCH — No clear match was found. The evidence suggests the title is not recognizable, or the book is not in OpenLibrary.`;

const phase4SystemPrompt =
  "You are a structured data extractor. You will receive a book identification analysis. Extract the recommended OpenLibrary work ID and evidence classification into the required JSON format. If the analysis concluded no match was found, set openlibrary_work_id to null and evidence to NO_MATCH.";

type ShapedImage = Awaited<ReturnType<typeof shapeImageData>>;

async function processImage(
  image: ShapedImage,
): Promise<OpenlibraryWorkIdExtractionResult | null> {
  logger.info(`Processing image: ${image.id}`);
  logger.debug(`Image URL: ${image.jpeg[640]}`);
  logger.debug(`Phase 1 model: ${getModel(0)}`);

  // --- Phase 1: OCR ---

  const phase1Response = await callOpenRouter(
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
            image_url: { url: image.jpeg[640] },
          },
          {
            type: "text",
            text: "Extract all visible text from this audiobook cover image. Include the title, subtitle, author name, series name, and any other text you can see. Return only the extracted text, nothing else.",
          },
        ],
      },
    ],
    getModel(0),
  );

  const ocrText = phase1Response.choices[0]?.message?.content;
  if (!ocrText) {
    throw new Error("Phase 1 OCR returned empty content");
  }
  logger.debug("Phase 1 - OCR Result:");
  logger.debug(ocrText);
  const phase1Usage: PhaseUsage = {
    promptTokens: phase1Response.usage?.prompt_tokens ?? 0,
    completionTokens: phase1Response.usage?.completion_tokens ?? 0,
    cost: extractCost(phase1Response),
  };
  totalCost += phase1Usage.cost;
  printPhaseUsage(1, phase1Usage);

  // --- Phase 2: OpenLibrary metadata collection via tool calling ---

  logger.debug(`Phase 2 model: ${getModel(1)}`);

  const phase2Messages: OpenRouterMessage[] = [
    { role: "system", content: phase2SystemPrompt },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: image.jpeg[640] },
        },
        {
          type: "text",
          text: `Here is the audiobook cover image. The OCR text extracted from it is:\n\n${ocrText}\n\nPlease search OpenLibrary to find the correct book entry for this audiobook cover.`,
        },
      ],
    },
  ];

  let phase2FinalContent = "";
  const phase2Usage: PhaseUsage = {
    promptTokens: 0,
    completionTokens: 0,
    cost: 0,
  };

  while (true) {
    const response = await callOpenRouter(phase2Messages, getModel(1), [
      searchOpenLibraryTool,
    ]);
    phase2Usage.promptTokens += response.usage?.prompt_tokens ?? 0;
    phase2Usage.completionTokens += response.usage?.completion_tokens ?? 0;
    phase2Usage.cost += extractCost(response);

    const message = response.choices[0]?.message;
    if (!message) break;

    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      phase2FinalContent = message.content!;
      break;
    }

    phase2Messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      if (toolCall.function.name !== "search_openlibrary") continue;

      let query = "";
      try {
        query = JSON.parse(toolCall.function.arguments).query ?? "";
      } catch {
        query = toolCall.function.arguments;
      }

      const searchResultJson = await searchOpenLibrary(query);

      phase2Messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: searchResultJson,
      });
    }
  }

  logger.debug("Phase 2 - Full conversation context:");
  for (const msg of phase2Messages) {
    if (msg.role !== "assistant") continue;
    if (typeof msg.content === "string" && msg.content)
      logger.debug(`  [ASSISTANT] ${msg.content}`);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        logger.debug(
          `  [ASSISTANT → TOOL] ${tc.function.name}(${tc.function.arguments})`,
        );
      }
    }
  }
  logger.debug("Phase 2 - Final model output:");
  logger.debug(phase2FinalContent);
  totalCost += phase2Usage.cost;
  printPhaseUsage(2, phase2Usage);

  // --- Phase 3: Candidate analysis & validation ---

  logger.debug(`Phase 3 model: ${getModel(2)}`);

  const phase3Messages: OpenRouterMessage[] = [
    { role: "system", content: phase3SystemPrompt },
    ...phase2Messages.slice(1),
    { role: "assistant" as const, content: phase2FinalContent },
    {
      role: "user",
      content:
        "Based on the research above, please analyze the candidates and select the best match. Discuss the strengths and weaknesses of this identification, your confidence level, and provide all available metadata for the selected book.",
    },
  ];

  let phase3FinalContent = "";
  const phase3Usage: PhaseUsage = {
    promptTokens: 0,
    completionTokens: 0,
    cost: 0,
  };

  while (true) {
    const response = await callOpenRouter(phase3Messages, getModel(2), [
      validateOpenLibraryTool,
    ]);
    phase3Usage.promptTokens += response.usage?.prompt_tokens ?? 0;
    phase3Usage.completionTokens += response.usage?.completion_tokens ?? 0;
    phase3Usage.cost += extractCost(response);

    const message = response.choices[0]?.message;
    if (!message) break;

    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      phase3FinalContent = message.content!;
      break;
    }

    phase3Messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      if (toolCall.function.name !== "search_openlibrary") continue;

      let query = "";
      try {
        query = JSON.parse(toolCall.function.arguments).query ?? "";
      } catch {
        query = toolCall.function.arguments;
      }

      const searchResultJson = await searchOpenLibrary(query);

      phase3Messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: searchResultJson,
      });
    }
  }

  logger.debug("Phase 3 - Analysis:");
  logger.debug(phase3FinalContent);
  totalCost += phase3Usage.cost;
  printPhaseUsage(3, phase3Usage);

  // --- Phase 4: Structured extraction ---

  logger.debug(`Phase 4 model: ${getModel(3)}`);

  const phase4Messages: OpenRouterMessage[] = [
    { role: "system", content: phase4SystemPrompt },
    { role: "user", content: phase3FinalContent },
  ];

  const phase4Response = await callOpenRouter(
    phase4Messages,
    getModel(3),
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

  const phase4Raw = phase4Response.choices[0]?.message?.content ?? "";
  const phase4Result = parseOpenlibraryWorkIdResult(phase4Raw);

  if (phase4Result) {
    logger.info(
      `Result: ${image.id} → OLID ${phase4Result.openlibrary_work_id ?? "null"} (${phase4Result.evidence}) — "${phase4Result.title ?? "unknown"}"`,
    );
    logger.debug("Phase 4 - Structured Result:");
    logger.debug(JSON.stringify(phase4Result, null, 2));
  } else {
    logger.warn(
      "Phase 4 failed to produce valid structured output. Raw response:",
    );
    logger.warn(phase4Raw);
  }
  const phase4Usage: PhaseUsage = {
    promptTokens: phase4Response.usage?.prompt_tokens ?? 0,
    completionTokens: phase4Response.usage?.completion_tokens ?? 0,
    cost: extractCost(phase4Response),
  };
  totalCost += phase4Usage.cost;
  printPhaseUsage(4, phase4Usage);

  return phase4Result;
}

// --- Image selection ---

let images: ShapedImage[];

if (imageId) {
  const dbImage = await sqlTools.one(DBImageDataValidator)`
    SELECT id, source, extension, blurhash, from_old_database, searchable
    FROM image
    WHERE id = ${imageId}
  `;
  images = [await shapeImageData(dbImage)];
} else {
  const dbImages = await sqlTools.many(DBImageDataValidator)`
    SELECT id, source, extension, blurhash, from_old_database, searchable
    FROM image
    ${tablesample ? sql`TABLESAMPLE BERNOULLI(${tablesample})` : sql``}
    WHERE openlibrary_work_id IS NULL AND deleted = false
  `;
  images = await shapeImageDataArray(dbImages);
  logger.info(`Found ${images.length} images to process`);
}

// --- Main loop ---

const expandedModel = [0, 1, 2, 3].map(getModel).join(":");

const isBatch = !imageId;
const limit = pLimit(threads);

await Promise.all(
  images.map((image) =>
    limit(async () => {
      let result: OpenlibraryWorkIdExtractionResult | null;
      try {
        result = await processImage(image);
      } catch (err: unknown) {
        if (isBatch) {
          logger.error(
            `Failed to process image ${image.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        throw err;
      }
      if (save && result) {
        await sqlTools.query`
          UPDATE image
          SET openlibrary_work_id = ${result.openlibrary_work_id},
              openlibrary_work_id_confidence = ${result.evidence},
              openlibrary_work_id_model = ${expandedModel}
          WHERE id = ${image.id}
        `;
        logger.info(
          `Saved: ${image.id} → OLID ${result.openlibrary_work_id} (${result.evidence})`,
        );
      }
    }),
  ),
);

logger.info(
  `Total cost: $${totalCost.toFixed(8)} | estimated cost per 1k runs: $${(totalCost * 1000).toFixed(2)}`,
);

con.closeSync();
db.closeSync();

await sql.end();
