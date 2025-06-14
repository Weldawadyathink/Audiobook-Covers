import { define } from "../../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    return new Response(
      `Server is healthy!`,
    );
  },
});
