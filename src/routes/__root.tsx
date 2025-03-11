import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Separator } from "../components/ui/Separator.tsx";

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{" "}
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
        <Link to="/image/search" className="[&.active]:font-bold">
          Search
        </Link>
        <Link to="/apidocs" className="[&.active]:font-bold">
          API
        </Link>
        <Link to="/contribute" className="[&.active]:font-bold">
          Contribute
        </Link>
      </div>
      <Separator />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
