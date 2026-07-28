import { forwardRef } from "react";
import { createLink, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const BaseNavBarItem = forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
  ({ children, className, ...props }, ref) => {
    const href = props.href || "";
    const pathname = useLocation({ select: (l) => l.pathname });
    const isActive = // If path is /, do not match subpaths
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(href + "/");
    return (
      <a
        ref={ref}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 [&_svg]:size-4 [&_svg]:shrink-0",
          isActive
            ? "bg-white/12 text-white shadow-inner shadow-white/5"
            : "text-slate-300 hover:bg-white/8 hover:text-white",
          className,
        )}
        {...props}
      >
        {children}
      </a>
    );
  },
);

export const NavBarItem = createLink(BaseNavBarItem);
