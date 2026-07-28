import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { getAccount, signOut } from "@/server/authFlow";
import { CheckCircle2, Clock, KeyRound } from "lucide-react";

export const Route = createFileRoute("/access/pending")({
  component: RouteComponent,
  loader: async () => ({ account: await getAccount() }),
});

function RouteComponent() {
  const { account } = Route.useLoaderData();
  const navigate = useNavigate();

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <Panel className="p-6 text-center sm:p-8">
          <h1 className="text-xl font-bold text-white">Not signed in</h1>
          <Link
            to="/access/signin"
            className="mt-4 inline-block text-sm text-cyan-200 underline-offset-4 hover:underline"
          >
            Sign in with your passkey
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <Panel className="p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          <KeyRound className="size-3.5" />
          Account
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">{account.email}</h1>

        {account.isAdmin ? (
          <>
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
              <CheckCircle2 className="size-4 shrink-0" />
              Admin access is active.
            </p>
            <Link
              to="/admin"
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-cyan-200 text-sm font-bold text-slate-950 hover:bg-cyan-100"
            >
              Go to admin
            </Link>
          </>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-300">
            <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
            This account is waiting for approval. Until an admin approves it, it
            can&apos;t see or change anything.
          </p>
        )}

        <p className="mt-4 text-xs text-slate-500">
          {account.passkeyCount} passkey
          {account.passkeyCount === 1 ? "" : "s"} registered.
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-6 h-11 w-full rounded-2xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
          onClick={async () => {
            await signOut();
            await navigate({ to: "/access/signin" });
          }}
        >
          Sign out
        </Button>
      </Panel>
    </div>
  );
}
