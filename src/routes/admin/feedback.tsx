import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast, Toaster } from "sonner";
import {
  getFeedbackDetail,
  listFeedback,
  lookupOpenLibraryWork,
  resolveFeedback,
} from "@/server/feedback";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ExternalLink,
  Link2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";

const searchParameters = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
  selected: z.uuid().optional(),
});

export const Route = createFileRoute("/admin/feedback")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    const [reports, detail] = await Promise.all([
      listFeedback({ data: { status: search.status } }),
      search.selected
        ? getFeedbackDetail({ data: { id: search.selected } })
        : null,
    ]);
    return { reports, detail, status: search.status };
  },
});

type Detail = NonNullable<Awaited<ReturnType<typeof getFeedbackDetail>>>;
type Candidate = Detail["candidates"][number];

function RouteComponent() {
  const { reports, detail, status } = Route.useLoaderData();
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Admin
      </Link>
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Feedback queue
      </h1>

      <div className="mt-5 flex gap-2">
        {(["OPEN", "RESOLVED", "DISMISSED"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              navigate({ to: "/admin/feedback", search: { status: value } })
            }
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              status === value
                ? "border-white/25 bg-white/12 text-white"
                : "border-white/10 bg-white/5 text-slate-400 hover:text-white",
            )}
          >
            {value.charAt(0) + value.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {detail && (
        <TriagePanel
          detail={detail}
          onClose={() =>
            navigate({ to: "/admin/feedback", search: { status } })
          }
        />
      )}

      <div className="mt-6 flex flex-col gap-2">
        {reports.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            Nothing here.
          </p>
        )}
        {reports.map((report) => (
          <Panel
            key={report.id}
            className={cn(
              "flex items-center gap-4 p-3",
              detail?.id === report.id && "border-cyan-200/40",
            )}
          >
            <img
              src={report.image.jpeg[320]}
              alt=""
              className="size-16 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictChip verdict={report.verdict} />
                <span className="truncate text-sm font-semibold text-white">
                  {report.title ?? "No match"}
                </span>
                {report.matchChangedSinceReport && (
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-100">
                    match changed since report
                  </span>
                )}
              </div>
              {report.note && (
                <p className="mt-1 truncate text-sm text-slate-300">
                  “{report.note}”
                </p>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                {report.createdAt}
                {report.authorNames.length > 0 &&
                  ` · ${report.authorNames.join(", ")}`}
                {report.resolution && ` · ${report.resolution}`}
                {report.resolvedBy && ` by ${report.resolvedBy}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={`/images/${report.image.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="grid size-9 place-items-center rounded-lg border border-white/12 bg-white/5 text-slate-300 hover:text-white"
                aria-label="Open cover page"
              >
                <ExternalLink className="size-4" />
              </a>
              {report.status === "OPEN" && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    navigate({
                      to: "/admin/feedback",
                      search: { status, selected: report.id },
                    })
                  }
                >
                  Triage
                </Button>
              )}
            </div>
          </Panel>
        ))}
      </div>
      <Toaster />
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: "CORRECT" | "INCORRECT" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        verdict === "CORRECT"
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          : "border-rose-300/30 bg-rose-300/10 text-rose-100",
      )}
    >
      {verdict === "CORRECT" ? (
        <ThumbsUp className="size-3" />
      ) : (
        <ThumbsDown className="size-3" />
      )}
      {verdict === "CORRECT" ? "Looks right" : "Wrong book"}
    </span>
  );
}

function TriagePanel({
  detail,
  onClose,
}: {
  detail: Detail;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [looked, setLooked] = useState<Candidate | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);

  async function act(action: "confirm" | "repoint" | "unmatch" | "dismiss") {
    setBusy(true);
    try {
      const result = await resolveFeedback({
        data: { id: detail.id, action, workId: selected?.workId },
      });
      toast(result.resolution);
      await router.invalidate();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function lookup() {
    setBusy(true);
    try {
      const work = await lookupOpenLibraryWork({ data: { reference } });
      const candidate: Candidate = {
        workId: work.workId,
        title: work.title,
        subtitle: work.subtitle ?? null,
        authorNames: work.authorNames,
        firstPublishYear: work.firstPublishYear ?? null,
        editionCount: work.editionCount ?? null,
        matchCount: work.matchCount,
      };
      setLooked(candidate);
      setSelected(candidate);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not look that up");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mt-6 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <VerdictChip verdict={detail.verdict} />
          <span className="text-xs text-slate-500">{detail.createdAt}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {detail.note && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
          “{detail.note}”
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div>
          <img
            src={detail.image.jpeg[640]}
            alt=""
            className="w-full rounded-2xl"
          />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Current match
          </p>
          {detail.current ? (
            <>
              <p className="mt-1 font-semibold text-white">
                {detail.current.title}
              </p>
              <p className="text-sm text-slate-400">
                {detail.current.authorNames.join(", ")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {detail.current.confidence} ·{" "}
                <a
                  href={`https://openlibrary.org/works/${detail.current.workId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-slate-300"
                >
                  {detail.current.workId}
                </a>
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No book matched.</p>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !detail.current}
              onClick={() => act("confirm")}
              className="rounded-xl bg-emerald-300 font-bold text-slate-950 hover:bg-emerald-200"
            >
              <BadgeCheck className="size-4" />
              Confirm this match
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => act("unmatch")}
              className="rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              <Trash2 className="size-4" />
              Remove match
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => act("dismiss")}
              className="rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Dismiss report
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Confirming or repointing marks the match as human-curated.
          </p>

          <div className="mt-5 border-t border-white/8 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Point at a different book
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Paste an OpenLibrary link or work id"
                className="h-11 rounded-xl border-white/15 bg-white/8 text-sm text-white placeholder:text-slate-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookup();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || !reference.trim()}
                onClick={lookup}
                className="h-11 shrink-0 rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
              >
                <Link2 className="size-4" />
                Look up
              </Button>
            </div>

            {looked && (
              <div className="mt-3">
                <CandidateRow
                  candidate={looked}
                  selected={selected?.workId === looked.workId}
                  onSelect={() => setSelected(looked)}
                />
              </div>
            )}

            {detail.candidates.length > 0 && (
              <>
                <p className="mt-5 text-xs text-slate-500">
                  Other works by{" "}
                  {detail.current?.authorNames.join(", ") || "this author"} —
                  covers already matched shown on the right. When one book has
                  several ids, prefer the one that already has covers.
                </p>
                <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                  <div className="flex flex-col gap-1.5">
                    {detail.candidates.map((candidate) => (
                      <CandidateRow
                        key={candidate.workId}
                        candidate={candidate}
                        selected={selected?.workId === candidate.workId}
                        onSelect={() => setSelected(candidate)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            <Button
              type="button"
              disabled={busy || !selected}
              onClick={() => act("repoint")}
              className="mt-4 h-11 w-full rounded-xl bg-cyan-200 font-bold text-slate-950 hover:bg-cyan-100"
            >
              <Check className="size-4" />
              {selected
                ? `Point this cover at ${selected.workId}`
                : "Choose a book above"}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        selected
          ? "border-cyan-200/50 bg-cyan-200/10"
          : "border-white/10 bg-white/5 hover:border-white/25",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {candidate.title}
          {candidate.subtitle ? `: ${candidate.subtitle}` : ""}
        </p>
        <p className="truncate text-xs text-slate-500">
          {candidate.workId}
          {candidate.firstPublishYear ? ` · ${candidate.firstPublishYear}` : ""}
          {candidate.editionCount
            ? ` · ${candidate.editionCount} editions`
            : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
          candidate.matchCount > 0
            ? "bg-cyan-200/15 text-cyan-100"
            : "bg-white/8 text-slate-500",
        )}
      >
        {candidate.matchCount} cover{candidate.matchCount === 1 ? "" : "s"}
      </span>
    </button>
  );
}
