import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { cache } from "react";
import { headers } from "next/headers";
import { type NextRequest } from "next/server";

const createContext = cache(() => {
  const heads = new Headers(headers());
  heads.set("x-trpc-source", "rsc");

  return createTRPCContext({
    headers: heads,
  });
});

type ResponseData = Array<{
  filename: string;
  versions: {
    png: {
      original: string;
    };
  };
  id: string;
  source: string;
  apiUsage: string;
}>;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return new Response("Query parameter missing", { status: 400 });
  }

  const caller = createCaller(createContext);

  try {
    const result = await caller.cover.searchByString({
      search: query,
      similarityThreshold: 2,
    });
    const response: ResponseData = result.map((img) => {
      return {
        filename: img.url,
        id: img.id,
        versions: {
          png: {
            original: img.url,
          },
        },
        source: img.source,
        apiUsage:
          "This api is for AudiobookShelf legacy compatability only. It should not be used for new projects.",
      };
    });
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (cause) {
    // If this a tRPC error, we can extract additional information.
    if (cause instanceof TRPCError) {
      // We can get the specific HTTP status code coming from tRPC (e.g. 404 for `NOT_FOUND`).
      const httpStatusCode = getHTTPStatusCodeFromError(cause);

      return new Response(
        JSON.stringify({ error: { message: cause.message } }),
        { status: httpStatusCode },
      );
    }

    // This is not a tRPC error, so we don't have specific information.
    return new Response(
      JSON.stringify({ error: { message: "Internal Server Error" } }),
      { status: 500 },
    );
  }
}
