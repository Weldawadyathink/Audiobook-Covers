import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beginRegistration, completeRegistration } from "@/server/authFlow";
import { KeyRound, ShieldQuestion } from "lucide-react";

export const Route = createFileRoute("/access/join")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("working");
    try {
      const options = await beginRegistration({ data: { email } });
      const credential = await startRegistration({
        optionsJSON: options as Parameters<
          typeof startRegistration
        >[0]["optionsJSON"],
      });
      await completeRegistration({ data: { credential } });
      await navigate({ to: "/access/pending" });
    } catch (err) {
      setStatus("idle");
      setError(messageFor(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <Panel className="p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          <KeyRound className="size-3.5" />
          Create account
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">Set up a passkey</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Your email identifies the account. Your device holds the passkey —
          there is no password to choose or forget.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-100">
              Email
            </span>
            <Input
              type="email"
              autoComplete="username webauthn"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-12 rounded-2xl border-white/15 bg-white/8 px-4 text-base text-white placeholder:text-slate-500 focus-visible:border-cyan-200 focus-visible:ring-cyan-200/30"
            />
          </label>

          <Button
            type="submit"
            disabled={status === "working" || !email}
            className="h-12 rounded-2xl bg-cyan-200 text-base font-bold text-slate-950 hover:bg-cyan-100"
          >
            {status === "working"
              ? "Waiting for your device…"
              : "Create passkey"}
          </Button>
        </form>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        <p className="mt-6 flex items-start gap-2 border-t border-white/8 pt-4 text-xs leading-relaxed text-slate-500">
          <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
          New accounts have no access to anything. An existing admin has to
          approve you before you can see or change anything.
        </p>

        <a
          href="/access/signin"
          className="mt-4 inline-block text-sm text-cyan-200 underline-offset-4 hover:underline"
        >
          Already have a passkey? Sign in
        </a>
      </Panel>
    </div>
  );
}

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NotAllowedError") || message.includes("aborted")) {
    return "Passkey setup was cancelled.";
  }
  return message || "Something went wrong. Try again.";
}
