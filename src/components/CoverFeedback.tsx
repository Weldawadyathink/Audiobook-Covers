import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { submitCoverFeedback } from "@/server/feedback";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";

/**
 * Lets any visitor say whether a cover is attached to the right book.
 *
 * "Wrong book" opens an optional one-line note before sending, because the
 * person reporting usually knows the answer and that note is what makes a report
 * triageable instead of just a complaint. The note stays optional so a one-click
 * report is still possible.
 */
export function CoverFeedback({ imageId }: { imageId: string }) {
  const [state, setState] = useState<"idle" | "noting" | "sending" | "sent">(
    "idle",
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(verdict: "CORRECT" | "INCORRECT") {
    setState("sending");
    setError(null);
    try {
      await submitCoverFeedback({
        data: {
          imageId,
          verdict,
          note: note.trim() ? note.trim().slice(0, 300) : undefined,
        },
      });
      setState("sent");
    } catch (err) {
      setState(verdict === "INCORRECT" ? "noting" : "idle");
      setError(err instanceof Error ? err.message : "Could not send that.");
    }
  }

  if (state === "sent") {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">
        <Check className="size-3.5 shrink-0" />
        Thanks — that helps. A human will take a look.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-300">
        Is this the right book?
      </p>

      {state === "noting" ? (
        <div className="mt-2.5">
          <label className="block text-xs text-slate-400" htmlFor="cover-note">
            Know which book it actually is? (optional)
          </label>
          <Input
            id="cover-note"
            value={note}
            maxLength={300}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            placeholder="Title, author, or an OpenLibrary link"
            className="mt-1.5 h-10 rounded-lg border-white/15 bg-white/8 text-sm text-white placeholder:text-slate-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send("INCORRECT");
              }
            }}
          />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              onClick={() => void send("INCORRECT")}
              className="h-9 flex-1 rounded-lg bg-cyan-200 text-xs font-bold text-slate-950 hover:bg-cyan-100"
            >
              Send report
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setState("idle")}
              className="h-9 rounded-lg text-xs text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <FeedbackButton
            onClick={() => void send("CORRECT")}
            disabled={state === "sending"}
            icon={<ThumbsUp className="size-3.5" />}
            label="Yes, that's it"
          />
          <FeedbackButton
            onClick={() => setState("noting")}
            disabled={state === "sending"}
            icon={<ThumbsDown className="size-3.5" />}
            label="No, wrong book"
          />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-200">{error}</p>}
    </div>
  );
}

function FeedbackButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors",
        "hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
