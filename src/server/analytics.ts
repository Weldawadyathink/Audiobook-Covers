import { z } from "zod/v4";
import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { PostHog } from "posthog-node";
import { env } from "@/server/env";
import { logger } from "../logger";

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
    const posthog = new PostHog(env.VITE_PUBLIC_POSTHOG_KEY, {
      host: env.VITE_PUBLIC_POSTHOG_HOST,
    });
    waitUntil(
      posthog.captureImmediate({
        event: data.eventType,
        properties: data.payload,
      }),
    );
    logger.info(`Logged analytics event: ${data.eventType}`);
  });
