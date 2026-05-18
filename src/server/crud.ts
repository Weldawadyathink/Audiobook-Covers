import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { getIsAuthenticated } from "./auth";
import { createWriteDb } from "@/server/db";
import { logAnalyticsEvent } from "@/server/analytics";
import { image } from "@/db/schema";
import { eq } from "drizzle-orm";

export const setImageDeleted = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const auth = await getIsAuthenticated();
    if (!auth.isAuthenticated) {
      throw new Error("Not authorized");
    }
    const writeDb = createWriteDb();
    await writeDb.update(image).set({ deleted: true }).where(eq(image.id, id));
    await logAnalyticsEvent({
      data: {
        eventType: "imageDeleted",
        payload: { id, username: auth.username, sessionId: auth.sessionId },
      },
    });
    return { success: true };
  });

export const setImageNotDeleted = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const auth = await getIsAuthenticated();
    if (!auth.isAuthenticated) {
      throw new Error("Not authorized");
    }
    const writeDb = createWriteDb();
    await writeDb
      .update(image)
      .set({ deleted: false })
      .where(eq(image.id, id));
    await logAnalyticsEvent({
      data: {
        eventType: "imageUndeleted",
        payload: { id, username: auth.username, sessionId: auth.sessionId },
      },
    });
    return { success: true };
  });

export const setImageSearchable = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const auth = await getIsAuthenticated();
    if (!auth.isAuthenticated) {
      throw new Error("Not authorized");
    }
    console.log("Setting image as searchable", id);
    const writeDb = createWriteDb();
    await writeDb
      .update(image)
      .set({ searchable: true })
      .where(eq(image.id, id));
    await logAnalyticsEvent({
      data: {
        eventType: "setImageSearchable",
        payload: { id, username: auth.username, sessionId: auth.sessionId },
      },
    });
    return { success: true };
  });

export const setImageNotSearchable = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    const auth = await getIsAuthenticated();
    if (!auth.isAuthenticated) {
      throw new Error("Not authorized");
    }
    console.log("Setting image as not searchable", id);
    const writeDb = createWriteDb();
    await writeDb
      .update(image)
      .set({ searchable: false })
      .where(eq(image.id, id));
    await logAnalyticsEvent({
      data: {
        eventType: "setImageNotSearchable",
        payload: { id, username: auth.username, sessionId: auth.sessionId },
      },
    });
    return { success: true };
  });
