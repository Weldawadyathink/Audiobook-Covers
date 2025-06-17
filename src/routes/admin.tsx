import { getIsAuthenticated } from "@/server/auth";
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

// Ensures that all routes under /admin are authenticated

export const Route = createFileRoute("/admin")({
  component: RouteComponent,
  loader: async () => {
    const auth = await getIsAuthenticated();
    if (!auth) {
      throw redirect({ to: "/login" });
    }
    return {};
  },
});

function RouteComponent() {
  return <Outlet />;
}
