import { tasks } from "@trigger.dev/sdk/v3";
import { ResourceMonitor } from "./resourceMonitor";

/**
 * Global middleware. `tasks.middleware` registers project-wide, not per-file, so
 * this lives in its own module rather than riding along inside a task file —
 * previously it was declared at the top of sync-work-search.ts, which meant
 * deleting that task silently disabled resource monitoring everywhere.
 */
tasks.middleware("resource-monitor", async ({ ctx, next }) => {
  const resourceMonitor = new ResourceMonitor({ ctx });
  resourceMonitor.startMonitoring(10_000);
  try {
    await next();
  } finally {
    resourceMonitor.stopMonitoring();
  }
});
