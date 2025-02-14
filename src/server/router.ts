import { z } from "zod";
import { coverRouter } from "./routers/cover.ts";
import { publicProcedure, router } from "./trpc.ts";

export const appRouter = router({
  cover: coverRouter,
  hello: publicProcedure.input(z.string().nullish()).query(({ input }) => {
    return `Hello ${input ?? "World"}!`;
  }),
  greeting: publicProcedure.query(() => "hello tRPC v10!"),
});

export type AppRouter = typeof appRouter;
