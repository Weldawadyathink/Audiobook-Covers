import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Link to="/admin/logout" className="text-red-600 hover:text-red-700">
          Logout
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <Link to="/admin/test" className="text-blue-400 hover:text-blue-300">
          Test
        </Link>
        <Link to="/admin/similar" className="text-blue-400 hover:text-blue-300">
          Similar Pairs
        </Link>
        <Link
          to="/admin/database_info"
          className="text-blue-400 hover:text-blue-300"
        >
          Database Info
        </Link>
      </div>
    </div>
  );
}
