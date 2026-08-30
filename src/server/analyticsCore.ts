import { z } from "zod/v4";
import { env as defaultEnv } from "@/env.cloudflare";
import { logger } from "@/logger";

// In theory, z.json() should work, but typescript complains about recursion with a server function
const json = z.lazy(() => {
  return z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
    z.undefined(),
  ]);
});

export const analyticsEvent = z.object({
  eventType: z.string(),
  payload: json,
});

export async function captureAnalyticsEvent({
  data,
}: {
  data: z.infer<typeof analyticsEvent>;
}) {
  const event = analyticsEvent.parse(data);
  const host = defaultEnv.VITE_PUBLIC_POSTHOG_HOST.replace(/\/$/, "");

  const capture = fetch(`${host}/capture/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      api_key: defaultEnv.VITE_PUBLIC_POSTHOG_KEY,
      event: event.eventType,
      properties: event.payload,
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
        logger.error("PostHog analytics capture failed", {
          eventType: event.eventType,
          status: response.status,
          statusText: response.statusText,
        });
      }
    })
    .catch((error: unknown) => {
      logger.error("PostHog analytics capture failed", {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.eventType,
      });
    });

  await capture;

  logger.info(`Logged analytics event: ${event.eventType}`);
}
