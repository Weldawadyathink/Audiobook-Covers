import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import NProgress from "nprogress";
// @ts-ignore
import nProgressCss from "nprogress/nprogress.css?url";
// @ts-ignore For some reason it doesn't like this pattern
import appCss from "@/styles/app.css?url";
import { NavBarItem } from "@/components/NavBarItem";
import { HeartHandshake, Info, Library, Menu, Search } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { PostHogProvider } from "@posthog/react";

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
        title: "AudiobookCovers.com",
      },
      {
        name: "description",
        content:
          "A searchable archive of community-made audiobook cover art. Search by book title and author, or by what the artwork looks like.",
      },
      {
        name: "theme-color",
        content: "#0b1220",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: nProgressCss },
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
      { rel: "manifest", href: "/site.webmanifest", color: "#ffffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-3 text-slate-400">
        That page does not exist. Try searching for a cover instead.
      </p>
      <a
        href="/search"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-200 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-100"
      >
        <Search className="size-4" />
        Search covers
      </a>
    </div>
  ),
});

function RouterProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  useEffect(() => {
    if (isLoading) {
      NProgress.start();
    } else {
      NProgress.done();
    }
  }, [isLoading]);
  return null;
}

const navLinks = [
  { to: "/search", label: "Search", icon: Search },
  { to: "/about", label: "About", icon: Info },
  { to: "/contribute", label: "Contribute", icon: HeartHandshake },
] as const;

function Wordmark({ className }: { className?: string }) {
  return (
    <NavBarItem to="/" className={className}>
      <span className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-cyan-300 to-violet-400 text-slate-950 shadow-lg shadow-cyan-500/20">
        <Library className="size-4" />
      </span>
      <span className="text-base font-bold tracking-tight text-white">
        AudiobookCovers
        <span className="text-slate-400">.com</span>
      </span>
    </NavBarItem>
  );
}

function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-white/8 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6">
        {/* Hamburger for mobile */}
        <div className="sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <button
                className="grid size-10 place-items-center rounded-full text-slate-200 transition-colors hover:bg-white/10 focus:outline-none"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="border-white/10 bg-slate-950/95 px-4 py-6 backdrop-blur-xl"
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <nav className="mt-10 flex flex-col gap-1">
                <SheetClose asChild>
                  <Wordmark className="mb-4" />
                </SheetClose>
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <SheetClose asChild key={to}>
                    <NavBarItem to={to} className="justify-start text-base">
                      <Icon />
                      <span>{label}</span>
                    </NavBarItem>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        <Wordmark className="max-sm:mx-auto max-sm:px-0" />

        {/* Inline nav for desktop */}
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavBarItem key={to} to={to}>
              <Icon />
              <span>{label}</span>
            </NavBarItem>
          ))}
        </nav>

        {/* Quick search shortcut for mobile, where nav links are hidden */}
        <NavBarItem
          to="/search"
          aria-label="Search"
          className="size-10 justify-center p-0 sm:hidden"
        >
          <Search />
        </NavBarItem>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/8 bg-slate-950/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Cover art by the community at{" "}
          <a
            href="https://www.reddit.com/r/audiobookcovers/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-200 underline-offset-4 hover:underline"
          >
            r/audiobookcovers
          </a>
          .
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a
            href="/about"
            className="transition-colors hover:text-slate-100"
          >
            About
          </a>
          <a
            href="/contribute"
            className="transition-colors hover:text-slate-100"
          >
            Contribute
          </a>
          <a
            href="https://github.com/Weldawadyathink/Audiobook-Covers"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-slate-100"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <RouterProgressBar />
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The gradient below is a fixed overlay, so it only ever paints the current
    // viewport. Without a solid colour on the document itself, everything past
    // the first screen — and iOS overscroll — falls through to the white
    // `bg-background` that app.css puts on body.
    <html lang="en" className="bg-slate-950">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950 text-white">
        <PostHogProvider
          apiKey="phc_vpuqBfVxumO7RMULNnJJk1d7mkVBUotX72PrsO64avP"
          options={{
            api_host: "https://x.audiobookcovers.com",
            defaults: "2026-01-30",
            capture_exceptions: true,
          }}
        >
          <div className="fixed inset-0 z-[-1] pointer-events-none">
            <div className="absolute inset-0 bg-linear-to-b from-slate-900 via-slate-950 to-slate-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_15%_0%,rgba(56,189,248,0.16),transparent_70%),radial-gradient(ellipse_50%_45%_at_85%_10%,rgba(167,139,250,0.14),transparent_70%)]" />
          </div>
          <SiteHeader />
          <div className="flex min-h-screen flex-col pt-16">
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </PostHogProvider>
        <Scripts />
      </body>
    </html>
  );
}
