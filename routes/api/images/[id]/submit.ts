import { define } from "../../../../utils.ts";
import { getIsAuthenticated } from "../../../../server/auth.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const auth = getIsAuthenticated(ctx.req);
    if (!auth) {
      return new Response("Not authenticated", { status: 401 });
    }
    const formData = await ctx.req.formData();
    console.log(formData);
    console.log(ctx.params.id);
    const headers = new Headers();
    headers.set("Location", `/images/${ctx.params.id}`);
    return new Response("Submitted", {
      status: 303,
      headers,
    });
  },
});
