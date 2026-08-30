import { forceAdmin } from "@/server/auth";
import { createFileRoute, Outlet } from "@tanstack/react-router";

// Ensures that all routes under /admin belong to an approved admin.
// forceAdmin redirects: signed out -> /access/signin, unapproved -> /access/pending

export const Route = createFileRoute("/admin")({
  component: RouteComponent,
  loader: async () => ({ admin: await forceAdmin() }),
});

function RouteComponent() {
  return <Outlet />;
}
