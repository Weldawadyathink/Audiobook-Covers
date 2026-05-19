import { createReadDb } from "@/server/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod/v4";
import base64 from "base-64";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { session, web_user } from "@/db/schema";

function parseCookie(str: string) {
  if (!str || typeof str !== "string") return {} as Record<string, string>;
  return str
    .split(";")
    .map((v) => v.split("="))
    .filter(
      (v): v is [string, string] =>
        v.length >= 2 && v[0] != null && v[1] != null,
    )
    .reduce(
      (acc, [key, val]) => {
        acc[decodeURIComponent(key.trim())] = decodeURIComponent(val.trim());
        return acc;
      },
      {} as Record<string, string>,
    );
}

type AuthenticationResult =
  | {
      isAuthenticated: false;
    }
  | {
      isAuthenticated: true;
      username: string;
      sessionId: string;
    };

export const getIsAuthenticated = createServerFn().handler(
  async ({ context }): Promise<AuthenticationResult> => {
    console.log("Checking auth");
    const request = getRequest();
    const cookies = parseCookie(request.headers.get("cookie") ?? "");
    if (!cookies) {
      return { isAuthenticated: false };
    }
    const authCookie = cookies["auth"];
    if (!authCookie) {
      return { isAuthenticated: false };
    }
    const decodedAuthCookie = base64.decode(authCookie);
    const auth = z
      .object({
        sessionId: z.string(),
        username: z.string(),
      })
      .safeParse(JSON.parse(decodedAuthCookie));

    if (!auth.success) {
      console.log("Could not parse auth cookie");
      return { isAuthenticated: false };
    }

    const readDb = createReadDb(context!.cloudflare.env);
    const [result] = await readDb
      .select({
        username: web_user.username,
        session_id: session.session_id,
      })
      .from(session)
      .innerJoin(web_user, eq(session.user_id, web_user.id))
      .where(
        and(
          eq(session.session_id, auth.data.sessionId),
          gt(session.expires_at, sql`NOW()`),
          eq(web_user.username, auth.data.username),
        ),
      )
      .limit(1);

    if (!result) {
      return { isAuthenticated: false };
    }
    if (
      result.session_id === auth.data.sessionId &&
      result.username === auth.data.username
    ) {
      await captureAnalyticsEvent({
        data: {
          eventType: "adminUserAuthSuccess",
          payload: {
            sessionId: auth.data.sessionId,
            username: auth.data.username,
          },
        },
        env: context!.cloudflare.env,
        ctx: context!.cloudflare.ctx,
      });
      return {
        isAuthenticated: true,
        username: result.username,
        sessionId: result.session_id,
      };
    } else {
      return { isAuthenticated: false };
    }
  },
);

export const forceAuthenticated = createServerFn().handler(async () => {
  const auth = await getIsAuthenticated();
  if (!auth.isAuthenticated) {
    throw redirect({ to: "/login" });
  } else {
    return true;
  }
});
