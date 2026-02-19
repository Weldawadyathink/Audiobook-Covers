import { forwardRef } from "react";
import { createLink } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const BaseNavBarItem = forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
  ({ children, ...props }, ref) => {
    return (
      <Button asChild size="lg">
        <a ref={ref} {...props}>
          {children}
        </a>
      </Button>
    );
  }
);

export const NavBarItem = createLink(BaseNavBarItem);
