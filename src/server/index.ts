import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./context.ts";
import { appRouter } from "./router.ts";
import { serveDir } from "@std/http/file-server";

function handler(request: any) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.startsWith("/trpc")) {
    return fetchRequestHandler({
      endpoint: "/trpc",
      req: request,
      router: appRouter,
      createContext,
    });
  }

  return serveDir(request, {
    fsRoot: "dist",
    urlRoot: "",
  });
}
Deno.serve({ port: 8000 }, handler);
