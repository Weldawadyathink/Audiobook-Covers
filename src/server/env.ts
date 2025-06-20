import { z } from "zod/v4";
import { createIsomorphicFn } from "@tanstack/react-start";

export const getEnv = createIsomorphicFn()
  .server(() =>
    z
      .object({
        DATABASE_URL: z.url(),
      })
      .parse(process.env),
  )
  .client(() => {
    throw new Error("This should never be called on the client");
  });
