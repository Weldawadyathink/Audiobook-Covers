import { z } from "zod/v4";
import { getDbPool, sql } from "@/server/db";
import base64 from "base-64";
import { createFileRoute } from "@tanstack/react-router";
import cookie from "cookie";
import argon2 from "argon2-browser";
import { randomBytes } from "node:crypto";
import { logAnalyticsEvent } from "@/server/analytics";

const formValidator = z.object({
  username: z.string(),
  password: z.string(),
});

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData();
        const { success, data: form } = formValidator.safeParse(
          Object.fromEntries(formData.entries()),
        );
        if (!success) {
          return new Response("Could not process username and password", {
            status: 400,
          });
        }
        const pool = await getDbPool();
        const result = await pool.maybeOne(
          sql.type(
            z.object({
              id: z.number(),
              username: z.string(),
              password_hash: z.string(),
            }),
          )`
        SELECT id, username, password_hash
        FROM web_user
        WHERE username = ${form.username}
      `,
        );
        if (!result) {
          await logAnalyticsEvent({
            data: {
              eventType: "adminUserLoginFailure",
              payload: {
                username: form.username,
                reason: "usernameNotFound",
              },
            },
          });
          return new Response("Invalid username or password", { status: 401 });
        }
        const valid = await argon2.verify(result.password_hash, form.password);
        if (!valid) {
          await logAnalyticsEvent({
            data: {
              eventType: "adminUserLoginFailure",
              payload: {
                username: form.username,
                reason: "passwordIncorrect",
              },
            },
          });
          return new Response("Invalid username or password", { status: 401 });
        }
        const sessionId = randomBytes(32).toString("hex");
        await pool.query(
          sql.typeAlias("void")`
        INSERT INTO session(session_id, user_id, expires_at)
        VALUES(${sessionId}, ${result.id}, NOW() + INTERVAL '1 day')
      `,
        );
        await logAnalyticsEvent({
          data: {
            eventType: "adminUserLoginSuccess",
            payload: {
              username: form.username,
              sessionId,
            },
          },
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
