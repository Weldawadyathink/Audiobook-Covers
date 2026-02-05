import { getDbPool, sql } from "@/server/db";
import { z } from "zod/v4";
import base64 from "base-64";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { logAnalyticsEvent } from "@/server/analytics";

function parseCookie(str: string) {
  if (!str || typeof str !== "string") return {} as Record<string, string>;
  return str
    .split(";")
    .map((v) => v.split("="))
    .filter((v): v is [string, string] => v.length >= 2 && v[0] != null && v[1] != null)
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
  async (): Promise<AuthenticationResult> => {
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

    const pool = await getDbPool();
    const result = await pool.maybeOne(
      sql.type(
        z.object({
          username: z.string(),
          session_id: z.string(),
        }),
      )`
        SELECT s.session_id AS session_id, u.username AS username
        FROM session s
        JOIN web_user u ON s.user_id = u.id
        WHERE session_id = ${auth.data.sessionId}
        AND expires_at > NOW()
        AND u.username = ${auth.data.username}
      `,
    );
    if (!result) {
      return { isAuthenticated: false };
    }
    if (
      result.session_id === auth.data.sessionId &&
      result.username === auth.data.username
    ) {
      await logAnalyticsEvent({
        data: {
          eventType: "adminUserAuthSuccess",
          payload: {
            sessionId: auth.data.sessionId,
            username: auth.data.username,
          },
        },
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
