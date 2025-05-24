import { publicProcedure, router } from "./trpc.ts";
import { z } from "zod";

export const appRouter = router({
  userList: publicProcedure
    .query(() => {
      // Retrieve users from a datasource, this is an imaginary database
      return "Hello World from tRPC!";
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
