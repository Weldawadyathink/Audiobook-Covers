import { createFileRoute } from "@tanstack/react-router";
import { Panel } from "@/components/Panel";
import { Code2, Heart, Palette } from "lucide-react";

export const Route = createFileRoute("/contribute")({
  component: RouteComponent,
});

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
          Contribute
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          This archive runs on the community
        </h1>
      </header>

      <div className="flex flex-col gap-5">
        <Panel className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-cyan-200">
            <Palette className="size-5" />
            <h2 className="text-lg font-semibold text-white">
              I have artwork to contribute
            </h2>
          </div>
          <p className="mt-3 leading-7 text-slate-300">
            Awesome! Post the artwork to{" "}
            <ProseLink href="https://www.reddit.com/r/audiobookcovers/">
              /r/audiobookcovers
            </ProseLink>
            . If you use an image host that is supported by the{" "}
            <ProseLink href="https://github.com/Serene-Arc/bulk-downloader-for-reddit">
              Bulk Downloader For Reddit
            </ProseLink>{" "}
            project, it will be automatically scanned and uploaded into my
            database. If you have another source for high quality cover artwork,
            contact me at{" "}
            <a
              href="mailto:admin@audiobookcovers.com"
              className="font-medium text-cyan-200 underline underline-offset-4 transition-colors hover:text-cyan-100"
            >
              admin@audiobookcovers.com
            </a>
            .
          </p>
          <p className="mt-3 leading-7 text-slate-300">
            This project would not be possible without the community
            contributions. Thank you for your hard work!
          </p>
        </Panel>

        <Panel className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-violet-200">
            <Code2 className="size-5" />
            <h2 className="text-lg font-semibold text-white">
              I am a programmer
            </h2>
          </div>
          <p className="mt-3 leading-7 text-slate-300">
            The source code for this project is{" "}
            <ProseLink href="https://github.com/Weldawadyathink/Audiobook-Covers">
              hosted on GitHub
            </ProseLink>
            . I welcome any code contributions.
          </p>
        </Panel>

        <Panel className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-rose-200">
            <Heart className="size-5" />
            <h2 className="text-lg font-semibold text-white">
              I want to help pay for server costs
            </h2>
          </div>
          <p className="mt-3 leading-7 text-slate-300">
            I have put a lot of work into keeping server costs low, but there
            are still some costs. You can contribute using{" "}
            <ProseLink href="https://github.com/sponsors/Weldawadyathink">
              GitHub Sponsors
            </ProseLink>
            . All money received will go directly into hosting and improving
            this project.
          </p>
        </Panel>
      </div>
    </div>
  );
}
