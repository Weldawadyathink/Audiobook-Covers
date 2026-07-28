import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import ImageCard from "@/components/ImageCard";
import { Panel } from "@/components/Panel";
import { SectionHeading } from "@/components/SectionHeading";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getIsAuthenticated } from "@/server/auth";
import { coverSearch } from "@/server/imageSearcher";
import { vectorSearchByString } from "@/server/imageSearcherAI";
import {
  ArrowRight,
  BookOpenText,
  Search,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";

const searchParameters = z.object({
  /**
   * Which search engine runs. Book (title/author full-text) is the default and
   * covers the vast majority of searches; visual (CLIP embedding) is the
   * fallback for "I only know what it looks like".
   */
  mode: z.enum(["book", "visual"]).optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  /** Free-text description, visual mode only. */
  q: z.string().optional(),
  showScore: z.boolean().optional(),
});

type SearchParameters = z.infer<typeof searchParameters>;
type Mode = "book" | "visual";

const bookExamples = [
  { title: "Project Hail Mary" },
  { title: "Dune", author: "Frank Herbert" },
  { author: "Brandon Sanderson" },
];

const visualExamples = [
  "a lone astronaut on a red desert planet",
  "moody watercolor forest at dusk",
  "art deco skyline in gold and black",
];

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    const mode: Mode = search.mode === "visual" ? "visual" : "book";
    const title = search.title?.trim() ?? "";
    const author = search.author?.trim() ?? "";
    const q = search.q?.trim() ?? "";

    const [auth, images] = await Promise.all([
      getIsAuthenticated(),
      mode === "visual"
        ? vectorSearchByString({ data: { q } })
        : coverSearch({ data: { title, author } }),
    ]);

    return {
      mode,
      title,
      author,
      q,
      showScore: search.showScore ?? false,
      images,
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

const fieldClass =
  "h-12 rounded-2xl border-white/15 bg-white/8 px-4 text-base text-white shadow-inner shadow-slate-950/20 placeholder:text-slate-500";

function RouteComponent() {
  const {
    mode,
    title,
    author,
    q,
    showScore: initialShowScore,
    images,
    isAuthenticated,
  } = Route.useLoaderData();
  const navigate = useNavigate();
  const isLoading = useRouterState({ select: (s) => s.isLoading });

  const [titleQuery, setTitleQuery] = useState(title);
  const [authorQuery, setAuthorQuery] = useState(author);
  const [visualQuery, setVisualQuery] = useState(q);
  const [showScore, setShowScore] = useState(initialShowScore);

  const hasSearch = mode === "visual" ? !!q : !!title || !!author;

  const runSearch = (overrides: Partial<SearchParameters> = {}) => {
    const next: SearchParameters = {
      mode: mode === "visual" ? "visual" : undefined,
      title: titleQuery.trim() || undefined,
      author: authorQuery.trim() || undefined,
      q: visualQuery.trim() || undefined,
      showScore: showScore || undefined,
      ...overrides,
    };
    navigate({ to: "/search", search: next });
  };

  /**
   * Switching modes carries the text across rather than dropping it — someone
   * who struck out searching for "Dune" by title should land in visual search
   * with "Dune" already run, not an empty box.
   */
  const switchMode = (next: Mode) => {
    if (next === "visual") {
      const carried =
        visualQuery.trim() ||
        [titleQuery.trim(), authorQuery.trim()].filter(Boolean).join(" ");
      setVisualQuery(carried);
      runSearch({ mode: "visual", q: carried || undefined });
    } else {
      const carried = titleQuery.trim() || visualQuery.trim();
      setTitleQuery(carried);
      runSearch({ mode: undefined, title: carried || undefined, q: undefined });
    }
  };

  const clearSearch = () => {
    setTitleQuery("");
    setAuthorQuery("");
    setVisualQuery("");
    navigate({
      to: "/search",
      search: { mode: mode === "visual" ? "visual" : undefined },
    });
  };

  const summary =
    mode === "visual"
      ? `“${q}”`
      : [title && `“${title}”`, author && `by ${author}`]
          .filter(Boolean)
          .join(" ");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Panel className="overflow-hidden">
        <div
          className={cn(
            "relative isolate px-5 py-7 sm:px-8 lg:px-10",
            "before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-px",
            mode === "visual"
              ? "before:bg-linear-to-r before:from-transparent before:via-violet-300/70 before:to-transparent"
              : "before:bg-linear-to-r before:from-transparent before:via-cyan-200/70 before:to-transparent",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 -z-10",
              mode === "visual"
                ? "bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.14),transparent_36%)]"
                : "bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.14),transparent_36%)]",
            )}
          />

          {mode === "book" ? (
            <BookSearchForm
              titleQuery={titleQuery}
              authorQuery={authorQuery}
              setTitleQuery={setTitleQuery}
              setAuthorQuery={setAuthorQuery}
              onSubmit={() => runSearch()}
              onSwitchMode={() => switchMode("visual")}
            />
          ) : (
            <VisualSearchForm
              visualQuery={visualQuery}
              setVisualQuery={setVisualQuery}
              onSubmit={() => runSearch()}
              onSwitchMode={() => switchMode("book")}
            />
          )}

          {isAuthenticated && (
            <AdminOptions
              showScore={showScore}
              onShowScoreChange={(value) => {
                setShowScore(value);
                runSearch({ showScore: value || undefined });
              }}
            />
          )}
        </div>
      </Panel>

      {!hasSearch && (
        <ExampleSearches
          mode={mode}
          onPickBook={(example) => {
            setTitleQuery(example.title ?? "");
            setAuthorQuery(example.author ?? "");
            runSearch({
              title: example.title,
              author: example.author,
              q: undefined,
            });
          }}
          onPickVisual={(example) => {
            setVisualQuery(example);
            runSearch({ mode: "visual", q: example });
          }}
        />
      )}

      {hasSearch && (
        <>
          <SectionHeading
            eyebrow="Results"
            title={
              isLoading
                ? "Searching…"
                : `${images.length} cover${images.length === 1 ? "" : "s"}`
            }
            description={summary ? `Matching ${summary}` : undefined}
            action={
              <Button
                type="button"
                variant="ghost"
                onClick={clearSearch}
                className="self-start rounded-full border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                Clear search
              </Button>
            }
          />

          {!isLoading && images.length === 0 && <NoResults mode={mode} />}

          {images.length > 0 && (
            <div
              className={cn(
                "grid grid-cols-2 gap-4 transition-opacity duration-200 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4",
                isLoading && "opacity-40",
              )}
            >
              {images.map((image) => (
                <ImageCard
                  key={image.id}
                  imageData={image}
                  showScore={showScore}
                  showDataset={isAuthenticated}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModeSwitchLink({
  onClick,
  children,
  accent,
}: {
  onClick: () => void;
  children: React.ReactNode;
  accent: "cyan" | "violet";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-2 rounded-full py-1 text-left text-sm font-medium transition-colors sm:w-auto sm:items-center",
        accent === "violet"
          ? "text-violet-200 hover:text-violet-100"
          : "text-cyan-200 hover:text-cyan-100",
      )}
    >
      {accent === "violet" ? (
        <Sparkles className="mt-0.5 size-4 shrink-0 sm:mt-0" />
      ) : (
        <BookOpenText className="mt-0.5 size-4 shrink-0 sm:mt-0" />
      )}
      <span className="underline-offset-4 group-hover:underline">
        {children}
        <ArrowRight className="ml-1.5 inline size-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function BookSearchForm({
  titleQuery,
  authorQuery,
  setTitleQuery,
  setAuthorQuery,
  onSubmit,
  onSwitchMode,
}: {
  titleQuery: string;
  authorQuery: string;
  setTitleQuery: (value: string) => void;
  setAuthorQuery: (value: string) => void;
  onSubmit: () => void;
  onSwitchMode: () => void;
}) {
  return (
    <>
      <div className="mb-6 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Find a cover for your audiobook
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
          Search the archive by book. A title on its own usually works; add the
          author to narrow it down.
        </p>
      </div>

      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
              <BookOpenText className="size-4 text-cyan-200" />
              Title
            </span>
            <Input
              type="text"
              value={titleQuery}
              placeholder="The Fellowship of the Ring"
              autoFocus={!titleQuery && !authorQuery}
              className={cn(
                fieldClass,
                "focus-visible:border-cyan-200 focus-visible:ring-cyan-200/30",
              )}
              onChange={(e) => setTitleQuery(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
              <UserRound className="size-4 text-violet-200" />
              Author
              <span className="font-normal text-slate-500">optional</span>
            </span>
            <Input
              type="text"
              value={authorQuery}
              placeholder="J. R. R. Tolkien"
              className={cn(
                fieldClass,
                "focus-visible:border-violet-200 focus-visible:ring-violet-200/30",
              )}
              onChange={(e) => setAuthorQuery(e.target.value)}
            />
          </label>

          <Button
            type="submit"
            className="h-12 rounded-2xl bg-cyan-200 px-7 text-base font-bold text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-100"
          >
            <Search className="size-4" />
            Search
          </Button>
        </div>
      </form>

      <div className="mt-5 border-t border-white/8 pt-4">
        <ModeSwitchLink accent="violet" onClick={onSwitchMode}>
          Only know what the artwork looks like? Try visual search
        </ModeSwitchLink>
      </div>
    </>
  );
}

function VisualSearchForm({
  visualQuery,
  setVisualQuery,
  onSubmit,
  onSwitchMode,
}: {
  visualQuery: string;
  setVisualQuery: (value: string) => void;
  onSubmit: () => void;
  onSwitchMode: () => void;
}) {
  return (
    <>
      <div className="mb-6 max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-100">
          <Sparkles className="size-3.5" />
          Visual search
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Describe the artwork
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
          This searches what the covers <em>look like</em> rather than which
          book they belong to. Describe the scene, the colors, or the mood.
        </p>
      </div>

      <form
        className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Wand2 className="size-4 text-violet-200" />
            Description
          </span>
          <Input
            type="text"
            value={visualQuery}
            placeholder="a lighthouse under a stormy purple sky"
            autoFocus={!visualQuery}
            className={cn(
              fieldClass,
              "focus-visible:border-violet-200 focus-visible:ring-violet-200/30",
            )}
            onChange={(e) => setVisualQuery(e.target.value)}
          />
        </label>

        <Button
          type="submit"
          className="h-12 rounded-2xl bg-violet-300 px-7 text-base font-bold text-slate-950 shadow-lg shadow-violet-950/30 hover:bg-violet-200"
        >
          <Sparkles className="size-4" />
          Search
        </Button>
      </form>

      <div className="mt-5 border-t border-white/8 pt-4">
        <ModeSwitchLink accent="cyan" onClick={onSwitchMode}>
          Know the book? Search by title and author
        </ModeSwitchLink>
      </div>
    </>
  );
}

function AdminOptions({
  showScore,
  onShowScoreChange,
}: {
  showScore: boolean;
  onShowScoreChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-5 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
      <span className="text-slate-500">Admin</span>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={showScore}
          className="size-4 rounded border-white/20 bg-white/10 accent-cyan-200"
          onChange={(e) => onShowScoreChange(e.target.checked)}
        />
        Show score
      </label>
    </div>
  );
}

function ExampleSearches({
  mode,
  onPickBook,
  onPickVisual,
}: {
  mode: Mode;
  onPickBook: (example: { title?: string; author?: string }) => void;
  onPickVisual: (example: string) => void;
}) {
  const chipClass =
    "rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        Try one of these
      </p>
      <div className="flex flex-wrap gap-2">
        {mode === "book"
          ? bookExamples.map((example) => (
              <button
                key={`${example.title ?? ""}-${example.author ?? ""}`}
                type="button"
                className={chipClass}
                onClick={() => onPickBook(example)}
              >
                {[example.title, example.author].filter(Boolean).join(" · ")}
              </button>
            ))
          : visualExamples.map((example) => (
              <button
                key={example}
                type="button"
                className={chipClass}
                onClick={() => onPickVisual(example)}
              >
                {example}
              </button>
            ))}
      </div>
    </div>
  );
}

function NoResults({ mode }: { mode: Mode }) {
  return (
    <Panel className="px-6 py-12 text-center">
      <p className="text-lg font-semibold text-white">No covers found</p>
      {mode === "book" ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Try a shorter title, drop the subtitle or punctuation, or search by
          the author alone. Not every book in the archive has been matched to a
          title yet — visual search reaches those too.
        </p>
      ) : (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Try describing the scene more plainly — colors, objects, and mood work
          better than book titles here.
        </p>
      )}
    </Panel>
  );
}
