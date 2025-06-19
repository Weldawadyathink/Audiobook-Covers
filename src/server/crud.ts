import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { getIsAuthenticated } from "./auth";
import { getDbPool } from "./db";
import { sql } from "slonik";
import { logAnalyticsEvent } from "@/server/analytics";

export const setImageDeleted = createServerFn()
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    if (!(await getIsAuthenticated())) {
      throw new Error("Not authorized");
    }
    const pool = await getDbPool();
    await pool.query(
      sql.unsafe`UPDATE image SET deleted = TRUE WHERE id = ${id}`
    );
    await logAnalyticsEvent({
      data: {
        eventType: "imageDeleted",
        payload: { id },
      },
    });
    return { success: true };
  });

export const setImageNotDeleted = createServerFn()
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    if (!(await getIsAuthenticated())) {
      return { success: false };
    }
    const pool = await getDbPool();
    await pool.query(
      sql.unsafe`UPDATE image SET deleted = FALSE WHERE id = ${id}`
    );
    await logAnalyticsEvent({
      data: {
        eventType: "imageUndeleted",
        payload: { id },
      },
    });
    return { success: true };
  });

export const setImageSearchable = createServerFn()
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    if (!(await getIsAuthenticated())) {
      return { success: false };
    }
    console.log("Setting image as searchable", id);
    const pool = await getDbPool();
    await pool.query(
      sql.unsafe`UPDATE image SET searchable = TRUE WHERE id = ${id}`
    );
    await logAnalyticsEvent({
      data: {
        eventType: "setImageSearchable",
        payload: { id },
      },
    });
    return { success: true };
  });

export const setImageNotSearchable = createServerFn()
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data: { id } }) => {
    if (!(await getIsAuthenticated())) {
      throw new Error("Not authorized");
    }
    console.log("Setting image as not searchable", id);
    const pool = await getDbPool();
    await pool.query(
      sql.unsafe`UPDATE image SET searchable = FALSE WHERE id = ${id}`
    );
    await logAnalyticsEvent({
      data: {
        eventType: "setImageNotSearchable",
        payload: { id },
      },
    });
    return { success: true };
  });
