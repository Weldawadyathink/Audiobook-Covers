import { createFileRoute } from "@tanstack/react-router";
import { ShieldsBadge } from "../components/ShieldsBadge";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-6 text-center">About</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">The Inspiration</h2>
        <p>
          I love searching{" "}
          <a
            href="https://www.reddit.com/r/audiobookcovers/"
            className="text-blue-600 underline hover:text-blue-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            /r/audiobookcovers
          </a>{" "}
          for custom artwork for my audiobooks, but Reddit's search is
          notoriously bad. I wanted a way to search for and download new artwork
          quickly and easily, without worrying about different image hosts,
          getting the highest image quality, or Reddit's interface. This started
          out as a personal project to archive the subreddit, but quickly grew
          into a website to contribute back to the community. I have redesigned
          this website numerous times. It serves as a benchmark for my personal
          skill growth in web development. I have made many mistakes along the
          way, but I am now happy with the project as it currently stands. I
          hope that you enjoy using this website.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">The Technology</h2>
        <div className="flex flex-col items-center gap-4 mt-10">
          <ShieldsBadge
            label="mobileclip"
            color="EEE"
            logo="apple"
            logoColor="#000000"
            href="https://github.com/apple/ml-mobileclip"
            alt="Search powered by mobileclip from Apple"
            className="h-8"
          />
          <ShieldsBadge
            label="Fly.io"
            color="EEE"
            logo="flydotio"
            logoColor="#24175B"
            href="https://fly.io"
            alt="Hosted on Fly.io"
            className="h-8"
          />
          <ShieldsBadge
            label="postgres"
            color="EEE"
            logo="postgresql"
            logoColor="4169E1"
            href="https://www.postgresql.org/"
            alt="Powered by Postgres"
            className="h-8"
          />
          <ShieldsBadge
            label="typescript"
            color="EEE"
            logo="typescript"
            logoColor="3178C6"
            href="https://www.typescriptlang.org/"
            alt="Built with TypeScript"
            className="h-8"
          />
          <ShieldsBadge
            label="Node.js"
            color="EEE"
            logo="node.js"
            logoColor="339933"
            href="https://nodejs.org/"
            alt="Built with Node.js"
            className="h-8"
          />
          <ShieldsBadge
            label="Vite"
            color="EEE"
            logo="vite"
            logoColor="646CFF"
            href="https://vitejs.dev/"
            alt="Built with Vite"
            className="h-8"
          />
          <ShieldsBadge
            label="shadcn/ui"
            color="EEE"
            logo="shadcnui"
            logoColor="#000000"
            href="https://ui.shadcn.com/"
            alt="Built with shadcn UI"
            className="h-8"
          />
          <ShieldsBadge
            label="Tanstack Router"
            color="EEE"
            href="https://tanstack.com/router/latest"
            alt="Built with shadcn UI"
            className="h-8"
          />
          <ShieldsBadge
            label="Tanstack Start"
            color="EEE"
            href="https://tanstack.com/start/latest"
            alt="Built with shadcn UI"
            className="h-8"
          />
        </div>
      </section>
    </div>
  );
}
