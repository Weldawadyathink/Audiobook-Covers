import { z } from "zod/v4";
import { parseEnv } from "@Weldawadyathink/zod-env"; //TODO: Switch to @keawade/zod-env once PR is merged

export const env = parseEnv(z.object({
  DATABASE_URL: z.url(),
  REPLICATE_API_TOKEN: z.string(),
}));
