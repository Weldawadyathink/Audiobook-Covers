import { define } from "../../utils.ts";
import { z } from "zod/v4";
import { getDbPool, sql } from "../../server/db.ts";
import { verify } from "@stdext/crypto/hash";
import { setCookie } from "@std/http";
import { env } from "../../env.ts";
import { encodeBase64 } from "@std/encoding";

const formValidator = z.object({
  username: z.string(),
  password: z.string(),
});

export const handler = define.handlers({
  async POST(ctx) {
    const formData = await ctx.req.formData();
    const { data: form, success } = formValidator.safeParse(
      Object.fromEntries(formData.entries()),
    );
    if (!success) {
      return new Response("Could not process username and password", {
        status: 400,
      });
    }
    console.log(`Log in request for ${form.username}`);
    const pool = await getDbPool();
    const result = await pool.maybeOne(
      sql.type(
        z.object({
          id: z.int(),
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
      console.log(`Log in failed for ${form.username}: user not found`);
      return new Response("Invalid username or password", { status: 401 });
    }
    if (!verify("argon2", form.password, result.password_hash)) {
      console.log(`Log in failed for ${form.username}: invalid password`);
      return new Response("Invalid username or password", { status: 401 });
    } else {
      const headers = new Headers();
      const url = new URL(ctx.req.url);
      const sessionId = crypto.randomUUID();
      setCookie(headers, {
        name: "auth",
        value: encodeBase64(JSON.stringify({
          sessionId,
          username: result.username,
        })),
        maxAge: 28800,
        sameSite: "Lax",
        domain: url.hostname,
        path: "/",
        secure: env.NODE_ENV === "production", // Insecure for dev environment
      });
      headers.set("Location", "/admin");
      console.log(sessionId);
      console.log(result);
      await pool.query(
        sql.typeAlias("void")`
          INSERT INTO session(session_id, user_id, expires_at)
          VALUES(${sessionId}, ${result.id}, NOW() + INTERVAL '1 day')
        `,
      );
      return new Response("Logged in", {
        status: 303,
        headers,
      });
    }
  },
});
