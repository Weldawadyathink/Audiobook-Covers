import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { requireAdmin } from "@/server/session";
import { createWriteDb } from "@/db.cloudflare";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { image } from "@/db/schema";
import { eq } from "drizzle-orm";

export const setImageDeleted = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const admin = await requireAdmin();
    const writeDb = createWriteDb();
    await writeDb.update(image).set({ deleted: true }).where(eq(image.id, id));
    await captureAnalyticsEvent({
      data: {
        eventType: "imageDeleted",
        payload: { id, email: admin.email },
      },
    });
    return { success: true };
  });

export const setImageNotDeleted = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const admin = await requireAdmin();
    const writeDb = createWriteDb();
    await writeDb.update(image).set({ deleted: false }).where(eq(image.id, id));
    await captureAnalyticsEvent({
      data: {
        eventType: "imageUndeleted",
        payload: { id, email: admin.email },
      },
    });
    return { success: true };
  });

export const setImageSearchable = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const admin = await requireAdmin();
    console.log("Setting image as searchable", id);
    const writeDb = createWriteDb();
    await writeDb
      .update(image)
      .set({ searchable: true })
      .where(eq(image.id, id));
    await captureAnalyticsEvent({
      data: {
        eventType: "setImageSearchable",
        payload: { id, email: admin.email },
      },
    });
    return { success: true };
  });

export const setImageNotSearchable = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const admin = await requireAdmin();
    console.log("Setting image as not searchable", id);
    const writeDb = createWriteDb();
    await writeDb
      .update(image)
      .set({ searchable: false })
      .where(eq(image.id, id));
    await captureAnalyticsEvent({
      data: {
        eventType: "setImageNotSearchable",
        payload: { id, email: admin.email },
      },
    });
    return { success: true };
  });
