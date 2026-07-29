import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { env } from "./src/env.node";

// Teaches the Trigger.dev bundler to resolve `import sql from "./x.sql?raw"` as
// a text import, matching Vite's built-in `?raw` behaviour so the same import
// works in both builds. BigQuery SQL is full of backticked table identifiers and
// regex backslashes, neither of which survive a JS template literal intact.
const sqlRawPlugin = esbuildPlugin({
  name: "sql-raw",
  setup(build) {
    build.onResolve({ filter: /\.sql\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, "")),
      namespace: "sql-raw",
    }));

    build.onLoad({ filter: /.*/, namespace: "sql-raw" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text" as const,
    }));
  },
});

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
    // DuckDB ships a native addon per platform. Bundling it produces a build
    // that resolves the `.node` binary relative to the wrong path at runtime, so
    // it has to stay an external require resolved from node_modules.
    // `@jsquash/webp` is WASM. The JS wrapper bundles fine, but it reaches for
    // its `.wasm` files through `require.resolve`, and esbuild does not copy
    // those into the bundle — so the package has to stay resolvable from
    // node_modules at runtime.
    external: ["@duckdb/node-api", "@duckdb/node-bindings", "@jsquash/webp"],
    extensions: [
      sqlRawPlugin,
      syncEnvVars(async (_) => {
        return Object.entries(env).map(([name, value]) => ({
          name,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }));
      }),
    ],
  },
});
