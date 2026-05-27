import { createServerFn } from "@tanstack/react-start";
import { analyticsEvent, captureAnalyticsEvent } from "@/server/analyticsCore";

export const logAnalyticsEvent = createServerFn()
  .inputValidator(analyticsEvent)
  .handler(async ({ data }) => {
    await captureAnalyticsEvent({ data });
  });
