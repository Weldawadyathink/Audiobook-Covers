import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/contribute")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-6 text-center">How to Contribute</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">
          I have artwork to contribute
        </h2>
        <p className="mb-2">
          Awesome! Post the artwork to{" "}
          <a
            href="https://www.reddit.com/r/audiobookcovers/"
            className="text-blue-600 underline hover:text-blue-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            /r/audiobookcovers
          </a>
          . If you use an image host that is supported by the{" "}
          <a
            href="https://github.com/Serene-Arc/bulk-downloader-for-reddit"
            className="text-blue-600 underline hover:text-blue-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bulk Downloader For Reddit
          </a>{" "}
          project, it will be automatically scanned and uploaded into my
          database. If you have another source for high quality cover artwork,
          contact me at{" "}
          <a
            href="mailto:admin@audiobookcovers.com"
            className="text-blue-600 underline hover:text-blue-800"
          >
            admin@audiobookcovers.com
          </a>
          .
        </p>
        <p>
          This project would not be possible without the community
          contributions. Thank you for your hard work!
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">I am a programmer</h2>
        <p>
          The source code for this project is{" "}
          <a
            href="https://github.com/Weldawadyathink/Audiobook-Covers"
            className="text-blue-600 underline hover:text-blue-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            hosted on GitHub
          </a>
          . I welcome any code contributions.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">
          I want to help pay for server costs
        </h2>
        <p>
          I have put a lot of work into keeping server costs low, but there are
          still some costs. You can contribute using{" "}
          <a
            href="https://github.com/sponsors/Weldawadyathink"
            className="text-blue-600 underline hover:text-blue-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Sponsors
          </a>
          . All money received will go directly into hosting and improving this
          project.
        </p>
      </section>
    </div>
  );
}
