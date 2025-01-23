import { Hono } from "npm:hono";
import { trpcServer } from "npm:@hono/trpc-server";
import { appRouter } from "./router.ts";
import { serveStatic } from "npm:hono/deno";

const app = new Hono();

app.get("/test", (c) => c.text("Hono!"));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
  })
);

app.get("/*", serveStatic({ root: "./dist/" }));

Deno.serve(app.fetch);
