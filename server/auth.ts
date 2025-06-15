import { getCookies } from "@std/http";
import { getDbPool, sql } from "./db.ts";
import { z } from "zod/v4";

export async function getIsAuthenticated(req: Request) {
  const cookies = getCookies(req.headers);
  const auth = cookies["auth"];
  if (!auth) {
    return false;
  }
  const pool = await getDbPool();
  const result = await pool.maybeOne(
    sql.type(
      z.object({
        token: z.string(),
      }),
    )`
      SELECT token
      FROM session
      WHERE token = ${auth}
      AND expires_at > NOW()
    `,
  );
  if (!result) {
    return false;
  }
  return result.token === auth;
}
