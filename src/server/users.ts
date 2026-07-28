import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { desc, eq, sql } from "drizzle-orm";
import { createReadDb, createWriteDb } from "@/db.cloudflare";
import { web_authn_credential, web_user } from "@/db/schema";
import { requireAdmin } from "@/server/session";
import { captureAnalyticsEvent } from "@/server/analyticsCore";

export const listAccounts = createServerFn().handler(async () => {
  await requireAdmin();
  const readDb = createReadDb();
  const approver = sql`(
    select u2.email from ${web_user} u2 where u2.id = ${web_user.approved_by}
  )`;
  const rows = await readDb
    .select({
      id: web_user.id,
      email: web_user.email,
      isAdmin: web_user.is_admin,
      createdAt: sql<string>`to_char(${web_user.created_at}, 'YYYY-MM-DD')`,
      lastLoginAt: sql<
        string | null
      >`to_char(${web_user.last_login_at}, 'YYYY-MM-DD')`,
      approvedBy: sql<string | null>`${approver}`,
      passkeyCount: sql<number>`(
        select count(*)::int from ${web_authn_credential} c
        where c.user_id = ${web_user.id}
      )`,
    })
    .from(web_user)
    .orderBy(desc(web_user.is_admin), desc(web_user.created_at));
  return rows;
});

export const setAccountAdmin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int(), isAdmin: z.boolean() }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();

    if (data.id === admin.id && !data.isAdmin) {
      // Removing your own admin rights could leave the site with none at all,
      // recoverable only by editing the database by hand.
      throw new Error("You cannot remove your own admin access.");
    }

    const writeDb = createWriteDb();
    await writeDb
      .update(web_user)
      .set(
        data.isAdmin
          ? {
              is_admin: true,
              approved_by: admin.id,
              approved_at: sql`NOW()`,
            }
          : { is_admin: false, approved_by: null, approved_at: null },
      )
      .where(eq(web_user.id, data.id));

    await captureAnalyticsEvent({
      data: {
        eventType: data.isAdmin ? "adminApproved" : "adminRevoked",
        payload: { targetUserId: data.id, byUserId: admin.id },
      },
    });
    return { success: true };
  });
