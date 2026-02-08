import { dbTransaction, sql } from "@/server/db";
import { z } from "zod/v4";
import { createServerFn } from "@tanstack/react-start";

// In theory, z.json() should work, but typescript complains about recursion with a server function
const json = z.lazy(() => {
  return z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]);
});

export const logAnalyticsEvent = createServerFn()
  .inputValidator(
    z.object({
      eventType: z.string(),
      payload: json,
    }),
  )
  .handler(async ({ data }) => {
    await dbTransaction(async (trx) => {
      return trx.query(sql.typeAlias("void")`
        INSERT INTO analytics_event (event_type, payload)
        VALUES (${data.eventType}, ${JSON.stringify(data.payload)})
      `);
    });
  });
