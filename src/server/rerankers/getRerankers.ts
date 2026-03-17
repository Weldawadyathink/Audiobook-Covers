import { rerankerMap } from "./rerankers";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";

export const getRerankers = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => Object.keys(rerankerMap));
