import { z } from "zod/v4";
import { createWriteDb } from "@/server/db";
import { eq, sql } from "drizzle-orm";
import base64 from "base-64";
import { createFileRoute } from "@tanstack/react-router";
import cookie from "cookie";
import argon2 from "argon2-browser";
import { randomBytes } from "node:crypto";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { session, web_user } from "@/db/schema";

const formValidator = z.object({
  username: z.string(),
  password: z.string(),
});

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const writeDb = createWriteDb(context!.cloudflare.env);
        const formData = await request.formData();
        const { success, data: form } = formValidator.safeParse(
          Object.fromEntries(formData.entries()),
        );
        if (!success) {
          return new Response("Could not process username and password", {
            status: 400,
          });
        }
        const [result] = await writeDb
          .select({
            id: web_user.id,
            username: web_user.username,
            password_hash: web_user.password_hash,
          })
          .from(web_user)
          .where(eq(web_user.username, form.username))
          .limit(1);
        if (!result) {
          await captureAnalyticsEvent({
            data: {
              eventType: "adminUserLoginFailure",
              payload: {
                username: form.username,
                reason: "usernameNotFound",
              },
            },
            env: context!.cloudflare.env,
            ctx: context!.cloudflare.ctx,
          });
          return new Response("Invalid username or password", { status: 401 });
        }
        const valid = await argon2.verify(result.password_hash, form.password);
        if (!valid) {
          await captureAnalyticsEvent({
            data: {
              eventType: "adminUserLoginFailure",
              payload: {
                username: form.username,
                reason: "passwordIncorrect",
              },
            },
            env: context!.cloudflare.env,
            ctx: context!.cloudflare.ctx,
          });
          return new Response("Invalid username or password", { status: 401 });
        }
        const sessionId = randomBytes(32).toString("hex");
        await writeDb.insert(session).values({
          session_id: sessionId,
          user_id: result.id,
          expires_at: sql`NOW() + INTERVAL '1 day'`,
        });
        await captureAnalyticsEvent({
          data: {
            eventType: "adminUserLoginSuccess",
            payload: {
              username: form.username,
              sessionId,
            },
          },
          env: context!.cloudflare.env,
          ctx: context!.cloudflare.ctx,
        });
        const authValue = base64.encode(
          JSON.stringify({ sessionId, username: result.username }),
        );
        const headers = new Headers();
        headers.append(
          "Set-Cookie",
          cookie.serialize("auth", authValue, {
            maxAge: 28800,
            sameSite: "lax",
            domain: new URL(request.url).hostname,
            path: "/",
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
          }),
        );
        headers.set("Location", "/admin");
        return new Response(null, {
          status: 303,
          headers,
        });
      },
    },
  },
});
