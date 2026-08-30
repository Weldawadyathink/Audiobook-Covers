import { parseEnv } from "./env";
import "dotenv/config";

export const env = parseEnv({
  ...process.env,
});
