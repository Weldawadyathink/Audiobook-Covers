import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
// @ts-ignore For some reason it doesn't like this pattern
import appCss from "@/styles/app.css?url";
import { Separator } from "@/components/ui/separator";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "TanStack Start Starter",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <span>404 Not Found</span>,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="fixed inset-0 z-[-1] bg-slate-700 " />
        <nav className="fixed top-0 left-0 right-0 z-30 w-full bg-slate-800/80 backdrop-blur border-b border-slate-700 shadow-md">
          <div className="mx-auto max-w-4xl flex items-center gap-4 px-4 py-2">
            <Link
              to="/"
              className="font-semibold hover:underline transition-colors"
            >
              Home
            </Link>
            <Link to="/search" className="hover:underline transition-colors">
              Search
            </Link>
            <Link to="/about" className="hover:underline transition-colors">
              About
            </Link>
            <Link
              to="/contribute"
              className="hover:underline transition-colors"
            >
              Contribute
            </Link>
            <Link to="/admin" className="hover:underline transition-colors">
              Admin
            </Link>
          </div>
        </nav>
        <div className="pt-16 m-2">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
