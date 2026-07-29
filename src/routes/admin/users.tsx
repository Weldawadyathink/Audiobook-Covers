import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { listAccounts, setAccountAdmin } from "@/server/users";
import { getAccount } from "@/server/authFlow";
import { toast, Toaster } from "sonner";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: RouteComponent,
  loader: async () => ({
    accounts: await listAccounts(),
    me: await getAccount(),
  }),
});

function RouteComponent() {
  const { accounts, me } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(id: number, isAdmin: boolean) {
    setBusy(id);
    try {
      await setAccountAdmin({ data: { id, isAdmin } });
      toast(isAdmin ? "Admin access granted" : "Admin access revoked");
      await router.invalidate();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not update account",
      );
    } finally {
      setBusy(null);
    }
  }

  const pending = accounts.filter((account) => !account.isAdmin);
  const admins = accounts.filter((account) => account.isAdmin);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Admin
      </Link>
      <h1 className="text-3xl font-bold tracking-tight text-white">Accounts</h1>
      <p className="mt-2 text-sm text-slate-400">
        Anyone can create an account at the join link. It does nothing until you
        grant admin access here.
      </p>

      <AccountSection
        title="Waiting for approval"
        empty="No accounts waiting."
        accounts={pending}
        meId={me?.email}
        busy={busy}
        onToggle={toggle}
      />
      <AccountSection
        title="Admins"
        empty="No admins yet — grant access to bootstrap."
        accounts={admins}
        meId={me?.email}
        busy={busy}
        onToggle={toggle}
      />
      <Toaster />
    </div>
  );
}

function AccountSection({
  title,
  empty,
  accounts,
  meId,
  busy,
  onToggle,
}: {
  title: string;
  empty: string;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  meId?: string;
  busy: number | null;
  onToggle: (id: number, isAdmin: boolean) => void;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {title}
      </h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <Panel
              key={account.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {account.email}
                  {account.email === meId && (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      you
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="size-3" />
                    {account.passkeyCount} passkey
                    {account.passkeyCount === 1 ? "" : "s"}
                  </span>
                  <span>joined {account.createdAt}</span>
                  {account.lastLoginAt && (
                    <span>last seen {account.lastLoginAt}</span>
                  )}
                  {account.approvedBy && (
                    <span>approved by {account.approvedBy}</span>
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy === account.id || account.email === meId}
                onClick={() => onToggle(account.id, !account.isAdmin)}
                className="shrink-0 rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
              >
                {account.isAdmin ? (
                  <>
                    <ShieldOff className="size-4" />
                    Revoke admin
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4" />
                    Make admin
                  </>
                )}
              </Button>
            </Panel>
          ))}
        </div>
      )}
    </section>
  );
}
