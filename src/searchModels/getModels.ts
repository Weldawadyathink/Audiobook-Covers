import { modelMap, defaultModelName } from "./models";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";

export const getModels = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => ({
    names: Object.keys(modelMap),
    default: defaultModelName,
  }));
