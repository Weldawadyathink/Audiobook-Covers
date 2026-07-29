import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel } from "@/components/Panel";
import { BookOpenText, ExternalLink, Sparkles } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

const technology = [
  {
    name: "Jina CLIP v2",
    detail: "Cover embeddings for visual search",
    href: "https://jina.ai/",
  },
  {
    name: "OpenLibrary",
    detail: "The book catalogue behind title and author search",
    href: "https://openlibrary.org/",
  },
  {
    name: "Postgres + pgvector",
    detail: "Hosted on PlanetScale",
    href: "https://planetscale.com/",
  },
  {
    name: "Cloudflare Workers",
    detail: "Runs the site at the edge",
    href: "https://workers.cloudflare.com/",
  },
  {
    name: "TanStack Start",
    detail: "React framework and router",
    href: "https://tanstack.com/start/latest",
  },
  {
    name: "Trigger.dev",
    detail: "Background jobs and the catalogue ETL",
    href: "https://trigger.dev/",
  },
  {
    name: "Tigris Data",
    detail: "Object storage for every cover",
    href: "https://www.tigrisdata.com",
  },
  {
    name: "TypeScript",
    detail: "End to end, front to back",
    href: "https://www.typescriptlang.org/",
  },
];

function ProseLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="font-medium text-cyan-200 underline underline-offset-4 transition-colors hover:text-cyan-100"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function RouteComponent() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          About
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          A home for audiobook cover art
        </h1>
      </header>

      <Panel className="p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-white">The inspiration</h2>
        <p className="mt-3 leading-7 text-slate-300">
          I love searching{" "}
          <ProseLink href="https://www.reddit.com/r/audiobookcovers/">
            /r/audiobookcovers
          </ProseLink>{" "}
          for custom artwork for my audiobooks, but Reddit&apos;s search is
          notoriously bad. I wanted a way to search for and download new artwork
          quickly and easily, without worrying about different image hosts,
          getting the highest image quality, or Reddit&apos;s interface. This
          started out as a personal project to archive the subreddit, but
          quickly grew into a website to contribute back to the community. I
          have redesigned this website numerous times. It serves as a benchmark
          for my personal skill growth in web development. I have made many
          mistakes along the way, but I am now happy with the project as it
          currently stands. I hope that you enjoy using this website.
        </p>
      </Panel>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel className="p-6">
          <div className="flex items-center gap-2 text-cyan-200">
            <BookOpenText className="size-5" />
            <h2 className="text-lg font-semibold text-white">Search by book</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Every cover is matched to a book in the OpenLibrary catalogue using
            an OCR and AI pipeline, then searched with Postgres full-text
            search. This is the default, and it is what you want almost every
            time.
          </p>
          <Link
            to="/search"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-200 underline-offset-4 hover:underline"
          >
            Search by title and author
          </Link>
        </Panel>

        <Panel className="p-6">
          <div className="flex items-center gap-2 text-violet-200">
            <Sparkles className="size-5" />
            <h2 className="text-lg font-semibold text-white">
              Search by artwork
            </h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Every cover also has a Jina CLIP v2 embedding stored in pgvector, so
            you can describe what a cover looks like and find it by appearance
            alone. Useful when a cover has never been matched to a book, or when
            you just want a particular mood.
          </p>
          <Link
            to="/search"
            search={{ mode: "visual" }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-violet-200 underline-offset-4 hover:underline"
          >
            Try visual search
          </Link>
        </Panel>
      </section>

      <Panel className="mt-6 p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-white">The technology</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {technology.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-white/25 hover:bg-white/10"
            >
              <div className="flex items-center gap-1.5 font-semibold text-white">
                {item.name}
                <ExternalLink className="size-3.5 text-slate-500 transition-colors group-hover:text-slate-300" />
              </div>
              <p className="mt-0.5 text-sm text-slate-400">{item.detail}</p>
            </a>
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-400">
          The whole thing is open source on{" "}
          <ProseLink href="https://github.com/Weldawadyathink/Audiobook-Covers">
            GitHub
          </ProseLink>
          , including a JSON search API at{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-slate-200">
            /api/search?q=…
          </code>
          .
        </p>
      </Panel>
    </div>
  );
}
