import { getDbPool, sql } from "@/server/db";
import { z } from "zod/v4";
import base64 from "base-64";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import cookie from "cookie";

export const getIsAuthenticated = createServerFn({ method: "GET" }).handler(
  async () => {
    console.log("Checking auth");
    const request = getWebRequest();
    const cookies = cookie.parse(request.headers.get("cookie") ?? "");
    if (!cookies) {
      return false;
    }
    const authCookie = cookies["auth"];
    if (!authCookie) {
      return false;
    }
    const decodedAuthCookie = base64.decode(authCookie);
    const auth = z
      .object({
        sessionId: z.uuid(),
        username: z.string(),
      })
      .safeParse(JSON.parse(decodedAuthCookie));

    if (!auth.success) {
      console.log("Could not parse auth cookie");
      return false;
    }

    const pool = await getDbPool();
    const result = await pool.maybeOne(
      sql.type(
        z.object({
          username: z.string(),
          session_id: z.string(),
        })
      )`
        SELECT s.session_id AS session_id, u.username AS username
        FROM session s
        JOIN web_user u ON s.user_id = u.id
        WHERE session_id = ${auth.data.sessionId}
        AND expires_at > NOW()
        AND u.username = ${auth.data.username}
      `
    );
    if (!result) {
      return false;
    }
    return (
      result.session_id === auth.data.sessionId &&
      result.username === auth.data.username
    );
  }
);
