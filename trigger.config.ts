import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { env } from "./src/env";

export default defineConfig({
  project: "proj_ysabtzlyltotwctspqpi",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 1,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    // duckdb is a native addon — exclude from bundle and deploy as a package
    external: ["@duckdb/node-api", "@duckdb/node-bindings"],
    extensions: [
      syncEnvVars(async (_) => {
        return Object.entries(env).map(([name, value]) => ({
          name,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }));
      }),
    ],
  },
});
