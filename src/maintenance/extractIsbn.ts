import { Command } from "commander";
import { getDbWriteConnection } from "@/server/db";
import { DBImageDataValidator, shapeImageData } from "@/server/imageData";
import { getEnv } from "@/server/env";
import ky from "ky";
import "dotenv/config";

const program = new Command();

program
  .requiredOption("-i, --image-id <uuid>", "The image ID to process")
  .option(
    "-m, --model <text>",
    "The OpenRouter model(s) to use. Use | to specify different models per phase (e.g. 'phase1model|phase2model')",
    "google/gemini-2.5-flash-lite",
  );

program.parse(process.argv);

const imageId: string = program.opts().imageId;
const model: string = program.opts().model;

const modelParts = model.split("|").map((s: string) => s.trim());
const getModel = (phase: number) =>
  modelParts[phase] ?? modelParts[modelParts.length - 1];

const env = getEnv();
const { sql, sqlTools } = getDbWriteConnection();

const dbImage = await sqlTools.one(DBImageDataValidator)`
  SELECT id, source, extension, blurhash, from_old_database, searchable
  FROM image
  WHERE id = ${imageId}
`;

const image = await shapeImageData(dbImage);
console.log(`Processing image: ${image.id}`);
console.log(`Image URL: ${image.jpeg[640]}`);
console.log(`Phase 1 model: ${getModel(0)}`);
console.log("---");

// --- Phase 1: OCR ---

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
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
};

async function callOpenRouter(
  messages: OpenRouterMessage[],
  phaseModel: string,
  tools?: object[],
): Promise<OpenRouterResponse> {
  return ky
    .post("https://openrouter.ai/api/v1/chat/completions", {
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      json: {
        model: phaseModel,
        messages,
        ...(tools ? { tools } : {}),
      },
      timeout: 120_000,
    })
    .json<OpenRouterResponse>();
}

const phase1Response = await callOpenRouter(
  [
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

const ocrText = phase1Response.choices[0]?.message?.content ?? "";
console.log("Phase 1 - OCR Result:");
console.log(ocrText);
console.log("---");

// --- Phase 2: Google Books metadata collection via tool calling ---

console.log(`Phase 2 model: ${getModel(1)}`);

type GoogleBooksVolume = {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

type GoogleBooksResponse = {
  totalItems: number;
  items?: GoogleBooksVolume[];
};

async function searchGoogleBooks(query: string): Promise<string> {
  console.log(`  [tool] search_google_books: "${query}"`);

  // Detect credential type: standard API keys start with "AIza",
  // OAuth2 access tokens start with "AQ." or "ya29.", or similar short-lived tokens.
  const googleKey = env.GOOGLE_BOOKS_API_KEY;
  const isApiKey = googleKey?.startsWith("AIza");

  async function fetchBooks(
    withKey: boolean,
    retryDelayMs = 0,
  ): Promise<GoogleBooksResponse> {
    if (retryDelayMs > 0)
      await new Promise((r) => setTimeout(r, retryDelayMs));
    const params = new URLSearchParams({ q: query, maxResults: "5" });
    const headers: Record<string, string> = {};
    if (withKey && googleKey) {
      if (isApiKey) {
        params.set("key", googleKey);
      } else {
        // OAuth2 access token — pass as Bearer
        headers["Authorization"] = `Bearer ${googleKey}`;
      }
    }
    return ky
      .get(`https://www.googleapis.com/books/v1/volumes?${params}`, {
        headers,
        timeout: 30_000,
        throwHttpErrors: true,
        retry: {
          limit: 4,
          statusCodes: [429, 500, 502, 503, 504],
          delay: (attempt) => Math.min(5_000 * 2 ** (attempt - 1), 60_000),
        },
      })
      .json<GoogleBooksResponse>();
  }

  let data: GoogleBooksResponse;
  try {
    // Try without key first — the Books API works unauthenticated and avoids
    // auth errors when the configured key is for a different Google service.
    data = await fetchBooks(false);
  } catch (err: unknown) {
    const isRateLimited =
      err instanceof Error && err.message.includes("429");
    if (isRateLimited) {
      console.warn("  [tool] Rate limited by Google Books API, skipping");
      return JSON.stringify({ error: "rate_limited", results: [] });
    }
    // If unauthenticated request failed for another reason, try with the key
    if (env.GOOGLE_BOOKS_API_KEY) {
      try {
        data = await fetchBooks(true);
      } catch (retryErr: unknown) {
        const retryRateLimited =
          retryErr instanceof Error && retryErr.message.includes("429");
        if (retryRateLimited) {
          console.warn("  [tool] Rate limited by Google Books API, skipping");
          return JSON.stringify({ error: "rate_limited", results: [] });
        }
        throw retryErr;
      }
    } else {
      throw err;
    }
  }

  if (!data.items || data.items.length === 0) {
    return JSON.stringify({ totalItems: 0, results: [] });
  }

  const results = data.items.map((vol) => ({
    id: vol.id,
    title: vol.volumeInfo.title,
    authors: vol.volumeInfo.authors,
    publishedDate: vol.volumeInfo.publishedDate,
    description: vol.volumeInfo.description?.slice(0, 300),
    isbns: vol.volumeInfo.industryIdentifiers,
    pageCount: vol.volumeInfo.pageCount,
    categories: vol.volumeInfo.categories,
    thumbnail:
      vol.volumeInfo.imageLinks?.thumbnail ??
      vol.volumeInfo.imageLinks?.smallThumbnail,
  }));

  return JSON.stringify({ totalItems: data.totalItems, results });
}

async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await ky.get(url, { timeout: 15_000 });
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType };
  } catch {
    return null;
  }
}

const searchGoogleBooksTool = {
  type: "function",
  function: {
    name: "search_google_books",
    description:
      "Search the Google Books API for book metadata. Use this to look up potential matches by title, author, ISBN, or any combination. You will receive the book metadata along with cover art images for each result.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query string (e.g. 'The Name of the Wind Patrick Rothfuss' or 'isbn:9780756404741')",
        },
      },
      required: ["query"],
    },
  },
};

const phase2SystemPrompt = `You are a book identification assistant. Your goal is to find the correct book entry in the Google Books database for an audiobook cover image.

You will be given:
1. The audiobook cover image
2. OCR text extracted from the cover

Your task:
1. Analyze the cover image and OCR text to identify the book title, author, series, and any other identifying information
2. Brainstorm multiple possible search queries to find the correct book
3. Use the search_google_books tool multiple times to gather metadata for candidate matches
4. For each search, you will receive book metadata and cover art thumbnails — use these visually to compare against the original cover
5. Collect all relevant metadata found across your searches

Be thorough: try variations of the title, author name, and series. Explore multiple candidates before concluding.`;

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
        text: `Here is the audiobook cover image. The OCR text extracted from it is:\n\n${ocrText}\n\nPlease search Google Books to find the correct book entry for this audiobook cover.`,
      },
    ],
  },
];

let phase2FinalContent = "";

// Agentic tool-use loop
while (true) {
  const response = await callOpenRouter(
    phase2Messages,
    getModel(1),
    [searchGoogleBooksTool],
  );

  const message = response.choices[0]?.message;
  if (!message) break;

  const toolCalls = message.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    // No more tool calls — final response
    phase2FinalContent = message.content ?? "";
    break;
  }

  // Append assistant message with tool calls
  phase2Messages.push({
    role: "assistant",
    content: message.content ?? "",
    tool_calls: toolCalls,
  });

  // Execute each tool call and append results
  for (const toolCall of toolCalls) {
    if (toolCall.function.name !== "search_google_books") continue;

    let query = "";
    try {
      query = JSON.parse(toolCall.function.arguments).query ?? "";
    } catch {
      query = toolCall.function.arguments;
    }

    const searchResultJson = await searchGoogleBooks(query);

    // Parse results to extract thumbnail URLs for multimodal inclusion
    let thumbnailParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
    try {
      const parsed = JSON.parse(searchResultJson) as {
        results?: Array<{ thumbnail?: string; title?: string }>;
      };
      if (parsed.results) {
        const imagePromises = parsed.results
          .filter((r) => r.thumbnail)
          .map(async (r) => {
            const imgData = await fetchImageAsBase64(r.thumbnail!);
            if (!imgData) return null;
            return {
              type: "image_url" as const,
              image_url: {
                url: `data:${imgData.mimeType};base64,${imgData.base64}`,
              },
            };
          });
        const resolved = await Promise.all(imagePromises);
        thumbnailParts = resolved.filter(
          (p): p is { type: "image_url"; image_url: { url: string } } =>
            p !== null,
        );
        if (thumbnailParts.length > 0) {
          console.log(
            `  [tool] fetched ${thumbnailParts.length} cover thumbnail(s)`,
          );
        }
      }
    } catch {
      // continue without thumbnails
    }

    // Build tool result message content
    const toolResultContent: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [
      { type: "text", text: searchResultJson },
      ...thumbnailParts,
    ];

    phase2Messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: toolResultContent as OpenRouterMessage["content"],
    });
  }
}

console.log("Phase 2 - Gathered Metadata:");
console.log(phase2FinalContent);
console.log("---");

await sql.end();
