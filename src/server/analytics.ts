import { createServerFn } from "@tanstack/react-start";
import { analyticsEvent, captureAnalyticsEvent } from "@/server/analyticsCore";

export const logAnalyticsEvent = createServerFn()
  .inputValidator(analyticsEvent)
  .handler(async ({ data, context }) => {
    await captureAnalyticsEvent({
      data,
      env: context!.cloudflare.env,
      ctx: context!.cloudflare.ctx,
    });
  });
