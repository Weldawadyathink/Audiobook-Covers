import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel } from "@/components/Panel";
import { getFeedbackCounts } from "@/server/feedback";
import {
  Database,
  FlaskConical,
  Images,
  LogOut,
  MessageSquareWarning,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: RouteComponent,
  loader: async () => ({ counts: await getFeedbackCounts() }),
});

const tools = [
  {
    to: "/admin/feedback",
    label: "Feedback queue",
    description: "Triage reports about wrong or confirmed book matches.",
    icon: MessageSquareWarning,
  },
  {
    to: "/admin/users",
    label: "Accounts",
    description: "Approve or revoke admin access.",
    icon: Users,
  },
  {
    to: "/admin/similar",
    label: "Similar pairs",
    description: "Find and remove near-duplicate uploads.",
    icon: Images,
  },
  {
    to: "/admin/database_info",
    label: "Database info",
    description: "Table sizes and row counts.",
    icon: Database,
  },
  {
    to: "/admin/test",
    label: "Test",
    description: "Scratch page.",
    icon: FlaskConical,
  },
] as const;

function RouteComponent() {
  const { counts } = Route.useLoaderData();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-white">Admin</h1>
        <Link
          to="/admin/logout"
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
          Sign out
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.to} to={tool.to} className="group">
            <Panel className="h-full p-5 transition-colors group-hover:border-white/25">
              <div className="flex items-center gap-2">
                <tool.icon className="size-4 text-cyan-200" />
                <span className="font-semibold text-white">{tool.label}</span>
                {tool.to === "/admin/feedback" && counts.OPEN > 0 && (
                  <span className="ml-auto rounded-full bg-cyan-200 px-2 py-0.5 text-xs font-bold text-slate-950">
                    {counts.OPEN}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-400">
                {tool.description}
              </p>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
