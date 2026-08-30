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
  searchConfirmedCovers,
} from "@/server/feedback";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ExternalLink,
  Link2,
  Search,
  Sparkles,
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
type ConfirmedCover = Awaited<ReturnType<typeof searchConfirmedCovers>>[number];

/** Whatever the admin has picked to repoint at, from any of the three sources. */
type Selection = {
  workId: string;
  title: string;
  subtitle: string | null;
  authorNames: string[];
  matchCount: number | null;
};

type RepointSource = "author" | "covers" | "link";

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
  const [source, setSource] = useState<RepointSource>(
    detail.candidates.length > 0 ? "author" : "covers",
  );
  const [reference, setReference] = useState("");
  const [looked, setLooked] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [coverQuery, setCoverQuery] = useState("");
  const [coverResults, setCoverResults] = useState<ConfirmedCover[] | null>(
    null,
  );

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
      const picked: Selection = {
        workId: work.workId,
        title: work.title,
        subtitle: work.subtitle ?? null,
        authorNames: work.authorNames,
        matchCount: work.matchCount,
      };
      setLooked(picked);
      setSelected(picked);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not look that up");
    } finally {
      setBusy(false);
    }
  }

  async function findCovers(mode: "book" | "similar") {
    setBusy(true);
    try {
      const results = await searchConfirmedCovers({
        data:
          mode === "similar"
            ? { likeImageId: detail.image.id }
            : { query: coverQuery },
      });
      setCoverResults(results);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not search");
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

            <div className="mt-3 flex flex-wrap gap-1.5">
              <SourceTab
                active={source === "author"}
                onClick={() => setSource("author")}
                label={`This author (${detail.candidates.length})`}
              />
              <SourceTab
                active={source === "covers"}
                onClick={() => setSource("covers")}
                label="Copy from a confirmed cover"
              />
              <SourceTab
                active={source === "link"}
                onClick={() => setSource("link")}
                label="Paste a link"
              />
            </div>

            {source === "link" && (
              <div className="mt-3">
                <div className="flex flex-col gap-2 sm:flex-row">
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
              </div>
            )}

            {source === "covers" && (
              <div className="mt-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={coverQuery}
                    onChange={(e) => setCoverQuery(e.target.value)}
                    placeholder="Search confirmed covers by title or author"
                    className="h-11 rounded-xl border-white/15 bg-white/8 text-sm text-white placeholder:text-slate-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void findCovers("book");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !coverQuery.trim()}
                    onClick={() => findCovers("book")}
                    className="h-11 shrink-0 rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                  >
                    <Search className="size-4" />
                    Search
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => findCovers("similar")}
                    className="h-11 shrink-0 rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                  >
                    <Sparkles className="size-4" />
                    Looks like this
                  </Button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Only covers a human already confirmed are searched — picking
                  one copies its book onto this cover.
                </p>

                {coverResults && coverResults.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    No confirmed covers matched.
                  </p>
                )}

                {coverResults && coverResults.length > 0 && (
                  <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                    {coverResults.map((result) => {
                      const isSelected = selected?.workId === result.workId;
                      return (
                        <button
                          key={result.image.id}
                          type="button"
                          onClick={() =>
                            setSelected({
                              workId: result.workId,
                              title: result.title,
                              subtitle: result.subtitle,
                              authorNames: result.authorNames,
                              matchCount: null,
                            })
                          }
                          className={cn(
                            "overflow-hidden rounded-xl border text-left transition-colors",
                            isSelected
                              ? "border-cyan-200/60 bg-cyan-200/10"
                              : "border-white/10 bg-white/5 hover:border-white/25",
                          )}
                        >
                          <img
                            src={result.image.jpeg[320]}
                            alt=""
                            className="aspect-square w-full object-cover"
                          />
                          <div className="px-2 py-1.5">
                            <p className="truncate text-xs font-medium text-white">
                              {result.title}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {result.authorNames.join(", ") || result.workId}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {source === "author" && (
              <div className="mt-3">
                {detail.candidates.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No other works by this author in the catalogue.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">
                      Covers already matched shown on the right. When one book
                      has several ids, prefer the one that already has covers.
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
              </div>
            )}

            {selected && (
              <p className="mt-4 rounded-xl border border-cyan-200/30 bg-cyan-200/10 px-3 py-2 text-xs text-cyan-50">
                Selected: <strong>{selected.title}</strong>
                {selected.authorNames.length > 0 &&
                  ` — ${selected.authorNames.join(", ")}`}{" "}
                ({selected.workId})
              </p>
            )}

            <Button
              type="button"
              disabled={busy || !selected}
              onClick={() => act("repoint")}
              className="mt-3 h-11 w-full rounded-xl bg-cyan-200 font-bold text-slate-950 hover:bg-cyan-100"
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

function SourceTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-white/25 bg-white/12 text-white"
          : "border-white/10 bg-white/5 text-slate-400 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: Selection | Candidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const matchCount = "matchCount" in candidate ? candidate.matchCount : null;
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
          {candidate.authorNames.length > 0
            ? ` · ${candidate.authorNames.join(", ")}`
            : ""}
        </p>
      </div>
      {matchCount !== null && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            matchCount > 0
              ? "bg-cyan-200/15 text-cyan-100"
              : "bg-white/8 text-slate-500",
          )}
        >
          {matchCount} cover{matchCount === 1 ? "" : "s"}
        </span>
      )}
    </button>
  );
}
