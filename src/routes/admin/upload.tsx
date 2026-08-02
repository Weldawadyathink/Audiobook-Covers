/**
 * Manual import: put covers into the catalogue by hand, through the pipeline the
 * automated importer uses.
 *
 * The page holds no ingest logic of its own. It stages bytes, starts one
 * `ingest-image` run per file, and renders what those runs publish to their own
 * metadata — so the checklist a human watches here is the same set of stages the
 * Reddit archiver will move through unattended, and there is no second
 * implementation to keep in step.
 *
 * Two places need a decision from the human, and both are duplicate questions:
 * before ingest, when a match is not clearly worse than the upload (the run stops
 * and waits rather than guessing); and after, when a superseded copy already had a
 * book match worth carrying over. See `docs/manual-upload.md`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { toast, Toaster } from "sonner";
import { z } from "zod/v4";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleDashed,
  ExternalLink,
  Loader2,
  Minus,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { jpegCoverUrl } from "@/image/urls";
import { MAX_IMAGE_BYTES } from "@/image/staging";
import { parseRedditCommentId, parseRedditPostId } from "@/reddit/ids";
import { lookupOpenLibraryWork } from "@/server/feedback";
import {
  discardStagedUpload,
  inheritImageMatch,
  stageUpload,
  startImageIngest,
  type UploadMetadata,
} from "@/server/upload";
import type { ingestImageTask } from "@/trigger/image/ingest";

export const Route = createFileRoute("/admin/upload")({
  component: RouteComponent,
});

/** The stages `ingest-image` reports, in the order it runs them. */
const STEP_LABELS: Array<{ name: string; label: string }> = [
  { name: "hash", label: "Decode and hash" },
  { name: "dedupe", label: "Duplicate check" },
  { name: "row", label: "Claim id and insert row" },
  { name: "original", label: "Store original" },
  { name: "reddit", label: "Reddit provenance" },
  { name: "derivatives", label: "Sizes and blurhash" },
  { name: "embedding", label: "Search embedding" },
  { name: "classify", label: "Book match" },
  { name: "supersede", label: "Replace older copies" },
];

const stepSchema = z.object({
  status: z.enum(["pending", "running", "done", "skipped", "review"]),
  detail: z.string().optional(),
});

const runMetadataSchema = z.object({
  steps: z.record(z.string(), stepSchema).optional(),
});

type Step = z.infer<typeof stepSchema>;

/** Every run status that means this file is not going to finish on its own. */
const FAILED_STATUSES = new Set<string>([
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "CANCELED",
  "EXPIRED",
]);

interface Slot {
  /** Stable across retries, so React keeps the card and its preview. */
  id: string;
  filename: string;
  previewUrl: string;
  /** The staged object, still there until a run ingests it or it is discarded. */
  stagedKey: string;
  runId?: string;
  accessToken?: string;
  /** Set when staging or triggering failed, i.e. before there is a run to watch. */
  error?: string;
  /** Locally applied after an inherit, which the finished run cannot know about. */
  inherited?: { workId: string; title: string | null };
  discarded?: boolean;
}

const emptyMetadata: UploadMetadata = {
  source: "",
  upstreamUrl: "",
  redditPostId: "",
  redditCommentId: "",
  searchable: true,
  classify: true,
  openlibraryWorkId: undefined,
};

function RouteComponent() {
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState<UploadMetadata>(emptyMetadata);
  const [work, setWork] = useState<{
    workId: string;
    title: string;
    authorNames: string[];
  } | null>(null);
  const [workReference, setWorkReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  /** Frozen at submit time: the runs in flight were started with these values. */
  const [submitted, setSubmitted] = useState<UploadMetadata>(emptyMetadata);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter((file) => {
      if (file.size > MAX_IMAGE_BYTES) {
        toast(`${file.name} is too large`, {
          description: `The limit is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
        });
        return false;
      }
      return true;
    });
    setFiles((current) => [...current, ...accepted].slice(0, 24));
  }

  async function lookUpWork() {
    if (!workReference.trim()) return;
    setBusy(true);
    try {
      const found = await lookupOpenLibraryWork({
        data: { reference: workReference },
      });
      setWork({
        workId: found.workId,
        title: found.title,
        authorNames: found.authorNames,
      });
      setForm((current) => ({ ...current, openlibraryWorkId: found.workId }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not look that up");
    } finally {
      setBusy(false);
    }
  }

  function clearWork() {
    setWork(null);
    setWorkReference("");
    setForm((current) => ({ ...current, openlibraryWorkId: undefined }));
  }

  async function submit() {
    if (files.length === 0) return;
    setBusy(true);

    const staged: Array<{ slot: Slot; key: string }> = [];
    const failed: Slot[] = [];

    // One request per file rather than one multipart body with all of them: a
    // single oversized submission is the one thing a Worker cannot recover from,
    // and staging is the cheap part of this pipeline anyway.
    for (const [index, file] of files.entries()) {
      const id = `${Date.now()}-${index}-${file.name}`;
      const previewUrl = URL.createObjectURL(file);
      try {
        const body = new FormData();
        body.set("file", file);
        const result = await stageUpload({ data: body });
        staged.push({
          slot: {
            id,
            filename: file.name,
            previewUrl,
            stagedKey: result.key,
          },
          key: result.key,
        });
      } catch (error) {
        failed.push({
          id,
          filename: file.name,
          previewUrl,
          stagedKey: "",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    if (staged.length === 0) {
      setSlots((current) => [...failed, ...current]);
      setBusy(false);
      return;
    }

    try {
      const { runs, publicAccessToken } = await startImageIngest({
        data: {
          items: staged.map(({ key }) => ({ key })),
          metadata: form,
        },
      });

      const started = staged.map(({ slot, key }) => ({
        ...slot,
        runId: runs.find((run) => run.key === key)?.runId,
        accessToken: publicAccessToken,
      }));

      setSubmitted(form);
      setSlots((current) => [...started, ...failed, ...current]);
      setFiles([]);
    } catch (error) {
      toast("Could not start the import", {
        description: error instanceof Error ? error.message : String(error),
      });
      setSlots((current) => [
        ...staged.map(({ slot }) => ({
          ...slot,
          error: error instanceof Error ? error.message : "Could not start",
        })),
        ...failed,
        ...current,
      ]);
    } finally {
      setBusy(false);
    }
  }

  /** Re-run one file past a duplicate review, with the human's decision. */
  async function retry(
    slot: Slot,
    options: { supersede: string[]; openlibraryWorkId?: string },
  ) {
    try {
      const { runs, publicAccessToken } = await startImageIngest({
        data: {
          items: [
            {
              key: slot.stagedKey,
              force: true,
              supersede: options.supersede,
              openlibraryWorkId: options.openlibraryWorkId,
            },
          ],
          metadata: submitted,
        },
      });
      setSlots((current) =>
        current.map((entry) =>
          entry.id === slot.id
            ? {
                ...entry,
                runId: runs[0]?.runId,
                accessToken: publicAccessToken,
                error: undefined,
              }
            : entry,
        ),
      );
    } catch (error) {
      toast("Could not restart the import", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function discard(slot: Slot) {
    try {
      await discardStagedUpload({ data: { key: slot.stagedKey } });
      setSlots((current) =>
        current.map((entry) =>
          entry.id === slot.id
            ? { ...entry, discarded: true, runId: undefined }
            : entry,
        ),
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not discard");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Toaster />
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Admin
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Upload covers
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Runs the same pipeline as the automated importer: duplicate check,
            derivatives, embedding, then the book match.
          </p>
        </div>
      </div>

      <Panel className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Source URL"
            hint="The page to link a visitor to. Left blank, a Reddit post id becomes one."
          >
            <Input
              value={form.source ?? ""}
              onChange={(event) =>
                setForm({ ...form, source: event.target.value })
              }
              placeholder="https://redd.it/1abc2de"
              className="rounded-xl"
            />
          </Field>
          <Field
            label="Upstream file URL"
            hint="Where the bytes actually came from, if they came from somewhere."
          >
            <Input
              value={form.upstreamUrl ?? ""}
              onChange={(event) =>
                setForm({ ...form, upstreamUrl: event.target.value })
              }
              placeholder="https://i.redd.it/abc123.jpg"
              className="rounded-xl"
            />
          </Field>
          <Field
            label="Reddit post id"
            hint="An id, a t3_ fullname or any link to the post. Stubbed for hydration if it is new."
          >
            <Input
              value={form.redditPostId ?? ""}
              onChange={(event) =>
                setForm({ ...form, redditPostId: event.target.value })
              }
              onBlur={(event) =>
                setForm((current) => ({
                  ...current,
                  redditPostId: normalise(
                    event.target.value,
                    parseRedditPostId,
                    "post",
                  ),
                }))
              }
              placeholder="1abc2de"
              className="rounded-xl"
            />
          </Field>
          <Field
            label="Reddit comment id"
            hint="Set when the link was a reply. A permalink to the comment works."
          >
            <Input
              value={form.redditCommentId ?? ""}
              onChange={(event) =>
                setForm({ ...form, redditCommentId: event.target.value })
              }
              onBlur={(event) =>
                setForm((current) => ({
                  ...current,
                  redditCommentId: normalise(
                    event.target.value,
                    parseRedditCommentId,
                    "comment",
                  ),
                }))
              }
              placeholder="k1lm2no"
              className="rounded-xl"
            />
          </Field>
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          <Field
            label="Book match (optional)"
            hint="Fill this in and the classifier is skipped — the match is recorded as human-curated."
          >
            {work ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-300/30 bg-emerald-300/5 px-3 py-2">
                <BadgeCheck className="size-4 shrink-0 text-emerald-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {work.title}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {work.authorNames.join(", ")} · {work.workId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearWork}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                  aria-label="Clear book match"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={workReference}
                  onChange={(event) => setWorkReference(event.target.value)}
                  placeholder="https://openlibrary.org/works/OL45883W or OL45883W"
                  className="rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !workReference.trim()}
                  onClick={lookUpWork}
                  className="shrink-0 rounded-xl border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                >
                  Look up
                </Button>
              </div>
            )}
          </Field>

          <div className="mt-4 flex flex-wrap gap-5">
            <Toggle
              checked={form.searchable ?? true}
              onChange={(checked) => setForm({ ...form, searchable: checked })}
              label="Searchable"
              hint="Off keeps the cover out of search results."
            />
            <Toggle
              checked={form.classify ?? true}
              onChange={(checked) => setForm({ ...form, classify: checked })}
              label="Run the book classifier"
              hint="Off leaves the match empty for later."
            />
          </div>
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          <label
            htmlFor="cover-files"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center transition-colors hover:border-white/30 hover:bg-white/5"
          >
            <Upload className="size-5 text-cyan-200" />
            <span className="text-sm font-semibold text-white">
              Choose cover images
            </span>
            <span className="text-xs text-slate-500">
              PNG, JPEG or WebP. Up to 24 files, each sharing the metadata
              above.
            </span>
            <input
              id="cover-files"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>

          {files.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {Math.max(1, Math.round(file.size / 1024))}KB
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, at) => at !== index),
                      )
                    }
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            disabled={busy || files.length === 0}
            onClick={submit}
            className="mt-4 rounded-xl bg-cyan-200 font-bold text-slate-950 hover:bg-cyan-100"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {files.length === 1
              ? "Import 1 cover"
              : `Import ${files.length} covers`}
          </Button>
        </div>
      </Panel>

      {slots.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Imports
          </h2>
          {slots.map((slot) => (
            <IngestCard
              key={slot.id}
              slot={slot}
              onRetry={(options) => retry(slot, options)}
              onDiscard={() => discard(slot)}
              onInherited={(inherited) =>
                setSlots((current) =>
                  current.map((entry) =>
                    entry.id === slot.id ? { ...entry, inherited } : entry,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Trim a pasted Reddit reference down to the bare id, on blur.
 *
 * The value that could not be parsed is left in the field rather than cleared:
 * the admin is one keystroke from fixing a paste and zero keystrokes from
 * retyping one that has been thrown away. The server normalises again anyway, so
 * this is ergonomics, not validation.
 */
function normalise(
  value: string,
  parse: (input: string) => string | null,
  what: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const id = parse(trimmed);
  if (!id) {
    toast(`That does not look like a Reddit ${what}`, {
      description: `Paste an id, a fullname or a link. Got "${trimmed}".`,
    });
    return trimmed;
  }
  return id;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-white/20 bg-white/10 accent-cyan-300"
      />
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

/**
 * One file, from staged bytes to finished cover.
 *
 * Subscribes to its own run: each card is its own component so the realtime hook
 * can be called once per run rather than juggling a list of subscriptions.
 */
function IngestCard({
  slot,
  onRetry,
  onDiscard,
  onInherited,
}: {
  slot: Slot;
  onRetry: (options: {
    supersede: string[];
    openlibraryWorkId?: string;
  }) => Promise<void>;
  onDiscard: () => Promise<void>;
  onInherited: (inherited: { workId: string; title: string | null }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [inheritFrom, setInheritFrom] = useState<string | null>(null);

  const { run, error } = useRealtimeRun<typeof ingestImageTask>(slot.runId, {
    accessToken: slot.accessToken,
    enabled: Boolean(slot.runId && slot.accessToken),
  });

  const metadata = runMetadataSchema.safeParse(run?.metadata ?? {});
  const steps = metadata.success ? (metadata.data.steps ?? {}) : {};
  const output = run?.output;
  const failure =
    slot.error ??
    // `error` is the subscription failing; `run.error` is the run failing. Both
    // leave the checklist frozen mid-stage, which is why the step marker needs to
    // know a failure happened rather than showing a spinner forever.
    error?.message ??
    run?.error?.message ??
    (run && FAILED_STATUSES.has(run.status)
      ? `The import ${run.status.toLowerCase().replace(/_/g, " ")}. Check the Trigger.dev dashboard for the stack trace.`
      : undefined);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5">
      <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <div>
          <img
            src={
              output?.status === "ingested"
                ? jpegCoverUrl(output.id, 320)
                : slot.previewUrl
            }
            alt=""
            className="w-full rounded-xl border border-white/10"
          />
          <p className="mt-2 truncate text-xs text-slate-500">
            {slot.filename}
          </p>
        </div>

        <div className="min-w-0">
          {slot.discarded ? (
            <p className="text-sm text-slate-400">
              Discarded. The staged file has been deleted.
            </p>
          ) : (
            <>
              <ol className="space-y-1.5">
                {STEP_LABELS.map(({ name, label }) => (
                  <StepRow
                    key={name}
                    label={label}
                    step={steps[name]}
                    stalled={Boolean(failure)}
                  />
                ))}
              </ol>

              {failure && (
                <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {failure}
                </p>
              )}

              {output?.status === "needs-review" && (
                <div className="mt-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                    <TriangleAlert className="size-4" />
                    Already in the catalogue?
                  </p>
                  <ul className="mt-1 mb-3 list-inside list-disc text-xs text-slate-400">
                    {output.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>

                  <div className="space-y-2">
                    {output.duplicates.map((duplicate) => (
                      <DuplicateRow
                        key={duplicate.id}
                        duplicate={duplicate}
                        inherit={inheritFrom === duplicate.id}
                        onInherit={() =>
                          setInheritFrom(
                            inheritFrom === duplicate.id ? null : duplicate.id,
                          )
                        }
                      />
                    ))}
                  </div>

                  {inheritFrom && (
                    <p className="mt-2 text-xs text-emerald-200">
                      Will inherit the book match from {inheritFrom} and skip
                      the classifier.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          onRetry({
                            supersede: [],
                            openlibraryWorkId: workIdOf(
                              output.duplicates,
                              inheritFrom,
                            ),
                          }),
                        )
                      }
                      className="rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20"
                    >
                      Import anyway, keep both
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          onRetry({
                            supersede: output.duplicates
                              .filter((duplicate) => !duplicate.deleted)
                              .map((duplicate) => duplicate.id),
                            openlibraryWorkId: workIdOf(
                              output.duplicates,
                              inheritFrom,
                            ),
                          }),
                        )
                      }
                      className="rounded-xl bg-amber-200 font-bold text-slate-950 hover:bg-amber-100"
                    >
                      Import and hide the others
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => act(onDiscard)}
                      className="rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}

              {output?.status === "ingested" && (
                <IngestedSummary
                  output={output}
                  inherited={slot.inherited}
                  busy={busy}
                  onInherit={(fromId) =>
                    act(async () => {
                      const result = await inheritImageMatch({
                        data: { id: output.id, fromId },
                      });
                      onInherited(result);
                      toast("Match inherited", {
                        description: `${output.id} is now ${result.workId}, human-curated.`,
                      });
                    })
                  }
                />
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function workIdOf(
  duplicates: Array<{ id: string; openlibrary_work_id: string | null }>,
  id: string | null,
) {
  if (!id) return undefined;
  return (
    duplicates.find((duplicate) => duplicate.id === id)?.openlibrary_work_id ??
    undefined
  );
}

type IngestedOutput = Extract<
  NonNullable<
    ReturnType<typeof useRealtimeRun<typeof ingestImageTask>>["run"]
  >["output"],
  { status: "ingested" }
>;

function IngestedSummary({
  output,
  inherited,
  busy,
  onInherit,
}: {
  output: IngestedOutput;
  inherited?: { workId: string; title: string | null };
  busy: boolean;
  onInherit: (fromId: string) => void;
}) {
  const match = inherited
    ? { workId: inherited.workId, title: inherited.title, confidence: "HUMAN" }
    : output.openlibrary;

  /**
   * A superseded copy with a book match is the one case worth offering: the
   * pictures are the same, so its match applies, and taking it costs nothing —
   * whereas re-running the classifier already happened by the time this renders.
   */
  const inheritable = output.duplicates.filter(
    (duplicate) =>
      duplicate.openlibrary_work_id &&
      duplicate.openlibrary_work_id !== match?.workId,
  );

  return (
    <div className="mt-4 space-y-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 text-emerald-200">
        <Check className="size-4" />
        <span className="font-semibold">In the catalogue</span>
        <Link
          to="/images/$id"
          params={{ id: output.id }}
          className="inline-flex items-center gap-1 font-mono text-xs text-slate-300 underline underline-offset-2 hover:text-white"
        >
          {output.id}
          <ExternalLink className="size-3" />
        </Link>
        <span className="text-xs text-slate-500">
          {output.upload.width}x{output.upload.height} {output.upload.format}
        </span>
      </p>

      {match ? (
        <p className="text-slate-300">
          {match.title ?? "Matched"}{" "}
          <span className="text-xs text-slate-500">
            {match.workId} · {match.confidence}
          </span>
        </p>
      ) : (
        <p className="text-slate-400">No book matched.</p>
      )}

      {output.superseded.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-amber-200">
          <span>Hidden from search in favour of this copy:</span>
          {output.superseded.map((id) => (
            <Link
              key={id}
              to="/images/$id"
              params={{ id }}
              className="font-mono underline underline-offset-2 hover:text-white"
            >
              {id}
            </Link>
          ))}
          <span className="text-slate-500">
            They keep their URLs, and each page has a Searchable toggle to put
            one back.
          </span>
        </p>
      )}

      {inheritable.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-slate-400">
            {output.superseded.length > 0
              ? "The copy this replaces was matched to a different book."
              : "A near-duplicate is matched to a different book."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {inheritable.map((duplicate) => (
              <Button
                key={duplicate.id}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onInherit(duplicate.id)}
                className="rounded-xl border-white/15 bg-white/5 text-xs text-slate-100 hover:bg-white/10 hover:text-white"
              >
                Use{" "}
                {duplicate.openlibrary_title ?? duplicate.openlibrary_work_id}{" "}
                from {duplicate.id}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DuplicateRow({
  duplicate,
  inherit,
  onInherit,
}: {
  duplicate: {
    id: string;
    distance: number;
    width: number | null;
    height: number | null;
    deleted: boolean;
    searchable: boolean | null;
    openlibrary_work_id: string | null;
    openlibrary_title: string | null;
    openlibrary_authors: string | null;
    openlibrary_work_id_confidence: string | null;
  };
  inherit: boolean;
  onInherit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2">
      <img
        src={jpegCoverUrl(duplicate.id, 320)}
        alt=""
        className="size-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            to="/images/$id"
            params={{ id: duplicate.id }}
            className="font-mono text-slate-200 underline underline-offset-2 hover:text-white"
          >
            {duplicate.id}
          </Link>
          <span className="text-slate-500">
            {duplicate.width ?? "?"}x{duplicate.height ?? "?"} ·{" "}
            {duplicate.distance} bits apart
          </span>
          {duplicate.deleted && (
            <span className="rounded-full bg-red-400/15 px-2 py-0.5 font-semibold text-red-200">
              deleted
            </span>
          )}
          {duplicate.searchable === false && !duplicate.deleted && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">
              not searchable
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm text-slate-300">
          {duplicate.openlibrary_title ?? "No book matched"}
          {duplicate.openlibrary_authors && (
            <span className="text-slate-500">
              {" "}
              — {duplicate.openlibrary_authors}
            </span>
          )}
          {duplicate.openlibrary_work_id_confidence && (
            <span className="text-xs text-slate-500">
              {" "}
              ({duplicate.openlibrary_work_id_confidence})
            </span>
          )}
        </p>
      </div>
      {duplicate.openlibrary_work_id && (
        <Button
          type="button"
          variant="ghost"
          onClick={onInherit}
          className={
            inherit
              ? "shrink-0 rounded-xl bg-emerald-300/15 text-xs text-emerald-200"
              : "shrink-0 rounded-xl text-xs text-slate-400 hover:bg-white/10 hover:text-white"
          }
        >
          {inherit ? "Inheriting match" : "Use this match"}
        </Button>
      )}
    </div>
  );
}

function StepRow({
  label,
  step,
  stalled,
}: {
  label: string;
  step?: Step;
  stalled: boolean;
}) {
  const status = step?.status ?? "pending";
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">
        {status === "done" && <Check className="size-4 text-emerald-300" />}
        {status === "skipped" && <Minus className="size-4 text-slate-500" />}
        {status === "review" && (
          <TriangleAlert className="size-4 text-amber-300" />
        )}
        {status === "running" &&
          (stalled ? (
            <TriangleAlert className="size-4 text-red-300" />
          ) : (
            <Loader2 className="size-4 animate-spin text-cyan-200" />
          ))}
        {status === "pending" && (
          <CircleDashed className="size-4 text-slate-600" />
        )}
      </span>
      <span className="min-w-0">
        <span
          className={
            status === "pending" ? "text-slate-500" : "font-medium text-white"
          }
        >
          {label}
        </span>
        {step?.detail && (
          <span className="block truncate text-xs text-slate-500">
            {step.detail}
          </span>
        )}
      </span>
    </li>
  );
}
