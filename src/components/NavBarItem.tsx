import { forwardRef } from "react";
import { createLink, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const BaseNavBarItem = forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
  ({ children, ...props }, ref) => {
    const href = props.href || "";
    const pathname = useLocation({ select: (l) => l.pathname });
    const isActive = // If path is /, do not match subpaths
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(href + "/");
    return (
      <Button asChild variant={isActive ? "secondary" : "ghost"} size="lg">
        <a ref={ref} {...props}>
          {children}
        </a>
      </Button>
    );
  }
);

export const NavBarItem = createLink(BaseNavBarItem);
