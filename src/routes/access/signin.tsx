import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { beginSignIn, completeSignIn } from "@/server/authFlow";
import { Fingerprint } from "lucide-react";

export const Route = createFileRoute("/access/signin")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setStatus("working");
    try {
      const options = await beginSignIn();
      const credential = await startAuthentication({
        optionsJSON: options as Parameters<
          typeof startAuthentication
        >[0]["optionsJSON"],
      });
      const result = await completeSignIn({ data: { credential } });
      await navigate({ to: result.isAdmin ? "/admin" : "/access/pending" });
    } catch (err) {
      setStatus("idle");
      setError(messageFor(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <Panel className="p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          <Fingerprint className="size-3.5" />
          Sign in
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">Use your passkey</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Your device will offer the passkey it has for this site.
        </p>

        <Button
          type="button"
          onClick={signIn}
          disabled={status === "working"}
          className="mt-6 h-12 w-full rounded-2xl bg-cyan-200 text-base font-bold text-slate-950 hover:bg-cyan-100"
        >
          {status === "working" ? "Waiting for your device…" : "Sign in"}
        </Button>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        <a
          href="/access/join"
          className="mt-6 inline-block text-sm text-cyan-200 underline-offset-4 hover:underline"
        >
          No account yet? Create one
        </a>
      </Panel>
    </div>
  );
}

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NotAllowedError") || message.includes("aborted")) {
    return "Sign-in was cancelled.";
  }
  return message || "Something went wrong. Try again.";
}
