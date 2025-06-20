import { getDbPool } from "@/server/db";
import { createServerFileRoute } from "@tanstack/react-start/server";

export const ServerRoute = createServerFileRoute("/api/heartbeat").methods({
  GET: async () => {
    const _pool = getDbPool();
    return new Response("Heartbeat", { status: 200 });
  },
});
