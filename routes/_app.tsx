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
        <Component />
      </body>
    </html>
  );
}
