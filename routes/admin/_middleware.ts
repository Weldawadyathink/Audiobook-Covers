import { define } from "../../utils.ts";
import { getIsAuthenticated } from "../../server/auth.ts";

// Ensure all requests to /admin/ are authenticated

export default define.middleware(async (ctx) => {
  const auth = await getIsAuthenticated(ctx.req);
  if (!auth) {
    const headers = new Headers();
    headers.set("Location", "/login");
    return new Response("Not authenticated", {
      status: 302,
      headers,
    });
  } else {
    return ctx.next();
  }
});
