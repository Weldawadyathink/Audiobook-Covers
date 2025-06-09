import { Hono } from "hono";

const validAPIKey = Deno.env.get("API_KEY");
if (!validAPIKey) {
  console.log("API_KEY environment variable is missing");
  Deno.exit(1);
}
const validAPIAuth = `Bearer ${validAPIKey}`;

const app = new Hono();

app.post("/download", (c) => {
  const auth = c.req.header("Authorization");
  if (!auth || auth !== validAPIAuth) {
    console.log("Unauthorized access");
    c.status(401);
    return c.text("Not authorized");
  }
  console.log("Authorized access");
  return c.text("Hello Hono!");
});

Deno.serve(app.fetch);
