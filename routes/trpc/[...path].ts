import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../server/index.ts";
import { createContext } from "@/server/fetch-context.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers((ctx) => {
  return fetchRequestHandler({
    endpoint: "/trpc",
    req: ctx.req,
    router: appRouter,
    createContext,
  });
});
