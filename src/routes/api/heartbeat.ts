import { getDbPool } from "@/server/db";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/heartbeat")({
  server: {
    handlers: {
      GET: async () => {
        // const _pool = getDbPool();
        return new Response("Heartbeat", { status: 200 });
      },
    },
  },
});
