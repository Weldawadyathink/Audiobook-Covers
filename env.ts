import { z } from "zod/v4";
import { parseEnv } from "@Weldawadyathink/zod-env"; //TODO: Switch to @keawade/zod-env once PR is merged

const envValidator = z.object({
  DATABASE_URL: z.url(),
  REPLICATE_API_TOKEN: z.string(),
  NODE_ENV: z.enum(["development", "build", "production"]),
});

type Env = z.infer<typeof envValidator>;

const builder_env = parseEnv(z.object({
  NODE_ENV: z.enum(["development", "build", "production"]),
}));

let env: Env;

if (builder_env.NODE_ENV === "build") {
  console.log(
    "Running in build mode, environment variables are not type checked",
  );
  // env variables not populated, but should not be needed during build
  env = builder_env as Env;
} else {
  env = parseEnv(envValidator);
}

export { env };
