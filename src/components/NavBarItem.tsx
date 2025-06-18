import { forwardRef } from "react";
import { createLink, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const BaseNavBarItem = forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
  ({ children, ...props }, ref) => {
    // We'll get 'to' and all link props via createLink
    // We'll get 'to' from props as well
    // @ts-ignore
    const to = props.to as string;
    const pathname = useLocation({ select: (l) => l.pathname });
    const isActive =
      to === "/"
        ? pathname === "/"
        : pathname === to || pathname.startsWith(to + "/");
    return (
      <Button asChild variant={isActive ? "secondary" : "ghost"}>
        <a ref={ref} {...props}>
          {children}
        </a>
      </Button>
    );
  }
);

export const NavBarItem = createLink(BaseNavBarItem);
