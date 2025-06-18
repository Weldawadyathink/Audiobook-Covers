import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import cookie from "cookie";
import { getDbPool, sql } from "@/server/db";
import { useEffect } from "react";

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const request = getWebRequest();
  const pool = await getDbPool();
  const authCookie = request.headers.get("cookie");
  if (authCookie) {
    const parsed = cookie.parse(authCookie);
    const auth = parsed.auth;
    if (auth) {
      try {
        const sessionId = JSON.parse(
          Buffer.from(auth, "base64").toString()
        ).sessionId;
        await pool.query(sql.typeAlias("void")`
          DELETE FROM session WHERE session_id = ${sessionId}
        `);
      } catch (e) {
        // If parsing fails, just continue with cookie removal
      }
    }
  }

  // Clear the auth cookie
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    cookie.serialize("auth", "", {
      maxAge: 0,
      sameSite: "lax",
      domain: new URL(request.url).hostname,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    })
  );
  return { success: true };
});

export const Route = createFileRoute("/admin/logout")({
  component: RouteComponent,
  loader: async () => {
    await logout();
    return { success: true };
  },
});

function RouteComponent() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/login" });
  }, [navigate]);

  return null;
}
