import { publicProcedure, router } from "../trpc.ts";

export const coverRouter = router({
  getRandom: publicProcedure.query(() => {
    console.log("getting random cover");
  }),
});
