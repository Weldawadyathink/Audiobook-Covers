import type { PageProps } from "fresh";

export default function App({ Component }: PageProps) {
  // Gradient from hypercolor.dev
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Audiobook-Covers-Fresh</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-purple-900 to-slate-900" />
        <div className="m-2 flex gap-2">
          <a href="/" className="[&.active]:font-bold">
            Home
          </a>{" "}
          <a href="/about" className="[&.active]:font-bold">
            About
          </a>
          <a href="/search" className="[&.active]:font-bold">
            Search
          </a>
          <a href="/apidocs" className="[&.active]:font-bold">
            API
          </a>
          <a href="/contribute" className="[&.active]:font-bold">
            Contribute
          </a>
        </div>
        {/*<Separator className="m-2" />*/}
        <div className="m-2">
          <Component />
        </div>
      </body>
    </html>
  );
}
