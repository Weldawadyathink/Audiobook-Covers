import { parseEnv } from "@/env";
import { env as workerEnv } from "cloudflare:workers";
import { createIsomorphicFn } from "@tanstack/react-start";

const envBuilder = createIsomorphicFn()
  .server(() => {
    let appStage = process.env.APP_STAGE ?? workerEnv.APP_STAGE ?? "unknown";
    if (appStage === "local") {
      return parseEnv({
        APP_STAGE: appStage,
      });
    }

    // When in dev or production, use hyperdrive
    return parseEnv({
      APP_STAGE: appStage,
      DATABASE_READ_URL: workerEnv.HYPERDRIVE?.connectionString!,
      DATABASE_WRITE_URL: workerEnv.HYPERDRIVE?.connectionString!,
    });
  })
  .client(() => {
    throw new Error("This should not be called on the client");
  });

export const env = envBuilder();
