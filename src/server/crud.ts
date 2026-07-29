import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { imageIdSchema } from "@/ids";
import { requireAdmin } from "@/server/session";
import { createWriteDb } from "@/db.cloudflare";
import { captureAnalyticsEvent } from "@/server/analyticsCore";
import { cover_feedback, image } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";

/**
 * One-click "yes, this is the right book" from the cover page.
 *
 * Stamps the match HUMAN, which is the same thing the triage queue does — a
 * person looked at it. Any open reports about this cover are closed at the same
 * time, so confirming here does not leave the queue holding a question that has
 * already been answered.
 */
export const confirmImageMatch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: imageIdSchema }))
  .handler(async ({ data: { id } }) => {
    const admin = await requireAdmin();
    const writeDb = createWriteDb();

    const [updated] = await writeDb
      .update(image)
      .set({ openlibrary_work_id_confidence: "HUMAN" })
      .where(and(eq(image.id, id), isNotNull(image.openlibrary_work_id)))
      .returning({ workId: image.openlibrary_work_id });

    if (!updated) {
      throw new Error("This cover has no matched book to confirm.");
    }

    await writeDb
      .update(cover_feedback)
      .set({
        status: "RESOLVED",
        resolved_by: admin.id,
        resolved_at: sql`NOW()`,
        resolution: "Match confirmed from the cover page",
      })
      .where(
        and(eq(cover_feedback.image_id, id), eq(cover_feedback.status, "OPEN")),
      );

    await captureAnalyticsEvent({
      data: {
        eventType: "imageMatchConfirmed",
        payload: { id, workId: updated.workId, email: admin.email },
      },
    });
    return { success: true };
  });

export const setImageDeleted = createServerFn()
  .inputValidator(z.object({ id: imageIdSchema }))
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
  .inputValidator(z.object({ id: imageIdSchema }))
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
  .inputValidator(z.object({ id: imageIdSchema }))
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
  .inputValidator(z.object({ id: imageIdSchema }))
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
