import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { z } from "zod/v4";
import { zodValidator } from "@tanstack/zod-adapter";
import ImageCard from "@/components/ImageCard";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getIsAuthenticated } from "@/server/auth";
import { coverSearch } from "@/server/imageSearcher";
import {
  BookOpenText,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

const searchParameters = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  showScore: z.boolean().optional(),
});

export const Route = createFileRoute("/search")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParameters),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: data }) => {
    const [auth, images] = await Promise.all([
      getIsAuthenticated(),
      coverSearch({
        data: {
          title: data.search.title,
          author: data.search.author,
        },
      }),
    ]);
    return {
      query: data.search,
      images,
      isAuthenticated: auth.isAuthenticated,
    };
  },
});

function RouteComponent() {
  const { query, images, isAuthenticated } = Route.useLoaderData();
  const navigate = useNavigate();
  const [titleQuery, setTitleQuery] = useState(query.title ?? "");
  const [authorQuery, setAuthorQuery] = useState(query.author ?? "");
  const [showScore, setShowScore] = useState(query.showScore ?? false);
  const hasSearch = !!query.title || !!query.author;

  const submitForm = () => {
    navigate({
      to: "/search",
      search: {
        title: titleQuery.trim() || undefined,
        author: authorQuery.trim() || undefined,
        showScore: showScore || undefined,
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-3 pb-10 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/45 shadow-2xl shadow-slate-950/30 backdrop-blur">
        <div className="relative isolate px-5 py-7 sm:px-8 lg:px-10">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.2),transparent_32%)]" />
          <div className="absolute inset-x-0 top-0 -z-10 h-px bg-linear-to-r from-transparent via-cyan-200/70 to-transparent" />

          <div className="mb-7 max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
              <Search className="size-3.5" />
              Cover Search
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Find audiobook covers by book details
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              Search the catalog with a title, an author, or both. Combining both
              fields usually gives the tightest matches.
            </p>
          </div>

          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              submitForm();
            }}
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <label className="group block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <BookOpenText className="size-4 text-cyan-200" />
                  Title
                </span>
                <Input
                  type="text"
                  value={titleQuery}
                  placeholder="The Fellowship of the Ring"
                  className="h-12 rounded-2xl border-white/15 bg-white/10 px-4 text-base text-white shadow-inner shadow-slate-950/20 placeholder:text-slate-400 focus-visible:border-cyan-200 focus-visible:ring-cyan-200/30"
                  onChange={(e) => setTitleQuery(e.target.value)}
                />
                <span className="mt-2 block text-xs text-slate-400">
                  Book title, subtitle, or series text.
                </span>
              </label>

              <label className="group block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <UserRound className="size-4 text-violet-200" />
                  Author
                </span>
                <Input
                  type="text"
                  value={authorQuery}
                  placeholder="J. R. R. Tolkien"
                  className="h-12 rounded-2xl border-white/15 bg-white/10 px-4 text-base text-white shadow-inner shadow-slate-950/20 placeholder:text-slate-400 focus-visible:border-violet-200 focus-visible:ring-violet-200/30"
                  onChange={(e) => setAuthorQuery(e.target.value)}
                />
                <span className="mt-2 block text-xs text-slate-400">
                  Author, narrator, or credited creator.
                </span>
              </label>

              <Button
                type="submit"
                className="h-12 rounded-2xl bg-cyan-200 px-7 font-bold text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-100"
              >
                <Search className="size-4" />
                Search
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-slate-400" />
                <span>Search results are ranked by title and author relevance.</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={showScore}
                  className="size-4 rounded border-white/20 bg-white/10 accent-cyan-200"
                  onChange={(e) => setShowScore(e.target.checked)}
                />
                Show score
              </label>
            </div>
          </form>
        </div>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Results
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {hasSearch
              ? `${images.length} cover${images.length === 1 ? "" : "s"} found`
              : "Start a search"}
          </h2>
        </div>
        {hasSearch && (query.title || query.author) && (
          <p className="max-w-xl text-sm text-slate-300 sm:text-right">
            Showing matches for{" "}
            {[query.title, query.author].filter(Boolean).join(" by ")}.
          </p>
        )}
      </div>

      {hasSearch && images.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-12 text-center shadow-xl shadow-slate-950/20">
          <p className="text-lg font-semibold text-white">No images found</p>
          <p className="mt-2 text-sm text-slate-300">
            Try a shorter title, remove punctuation, or search with just the author.
          </p>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-1 justify-center gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <ImageCard
              showScore={showScore}
              showDataset={isAuthenticated}
              key={image.id}
              imageData={image}
              className="max-w-96"
            />
          ))}
        </div>
      )}

      <Outlet />
    </div>
  );
}
