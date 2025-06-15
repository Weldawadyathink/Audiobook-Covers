import { define } from "../../../../utils.ts";
import { getIsAuthenticated } from "../../../../server/auth.ts";
import { z } from "zod/v4";
import { getDbPool, sql } from "../../../../server/db.ts";

const formValidator = z.object({
  searchable: z.stringbool(),
});

export const handler = define.handlers({
  async POST(ctx) {
    const auth = getIsAuthenticated(ctx.req);
    if (!auth) {
      return new Response("Not authenticated", { status: 401 });
    }
    const formData = await ctx.req.formData();
    console.log(formData);
    const form = formValidator.safeParse(
      Object.fromEntries(formData.entries()),
    );
    console.log(form);
    if (!form.success) {
      return new Response("Could not process form data", { status: 400 });
    }

    // Request is valid, update database
    const pool = await getDbPool();
    await pool.query(
      sql.typeAlias("void")`
        UPDATE image
        SET searchable = ${form.data.searchable}
        WHERE id = ${ctx.params.id}
      `,
    );

    const headers = new Headers();
    headers.set("Location", `/images/${ctx.params.id}`);
    return new Response("Submitted", {
      status: 303,
      headers,
    });
  },
});
