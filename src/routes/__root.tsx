import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
// @ts-ignore For some reason it doesn't like this pattern
import appCss from "@/styles/app.css?url";
import { NavBarItem } from "@/components/NavBarItem";
import {
  HeartHandshake,
  House,
  Info,
  Search,
  ShieldUser,
  Menu,
} from "lucide-react";
import { Separator } from "@radix-ui/react-separator";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";

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
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="fixed inset-0 z-[-1] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900" />
        </div>
        <nav className="fixed top-0 left-0 right-0 z-30 w-full bg-slate-800/80 backdrop-blur border-b border-slate-700 shadow-md">
          <div className="mx-auto max-w-4xl flex items-center justify-between px-4 py-2">
            {/* Hamburger for mobile */}
            <div className="flex items-center w-full">
              <div className="flex-1 flex sm:hidden items-center relative">
                <Sheet>
                  <SheetTrigger asChild>
                    <button
                      className="p-2 text-slate-200 focus:outline-none"
                      aria-label="Open menu"
                    >
                      <Menu className="w-6 h-6" />
                    </button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    className="bg-slate-800/80 backdrop-blur px-4 py-6"
                  >
                    <nav className="flex flex-col gap-4 mt-8">
                      <NavBarItem to="/">
                        <span>Home</span>
                        <House />
                      </NavBarItem>
                      <NavBarItem to="/search">
                        <span>Search</span>
                        <Search />
                      </NavBarItem>
                      <NavBarItem to="/about">
                        <span>About</span>
                        <Info />
                      </NavBarItem>
                      <NavBarItem to="/contribute">
                        <span>Contribute</span>
                        <HeartHandshake />
                      </NavBarItem>
                    </nav>
                  </SheetContent>
                </Sheet>
                <span className="absolute left-1/2 -translate-x-1/2 text-xl font-bold text-slate-100">
                  AudiobookCovers.com
                </span>
              </div>
              {/* Inline nav for desktop */}
              <div className="hidden sm:flex gap-8 w-full justify-center">
                <NavBarItem to="/">
                  <span>AudiobookCovers.com</span>
                  <House />
                </NavBarItem>
                <NavBarItem to="/search">
                  <span>Search</span>
                  <Search />
                </NavBarItem>
                <NavBarItem to="/about">
                  <span>About</span>
                  <Info />
                </NavBarItem>
                <NavBarItem to="/contribute">
                  <span>Contribute</span>
                  <HeartHandshake />
                </NavBarItem>
              </div>
            </div>
          </div>
        </nav>
        <div className="pt-16 m-2">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
