import { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

interface NavBarItemProps {
  to: string;
  children: ReactNode;
}

export function NavBarItem({ to, children }: NavBarItemProps) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const isActive =
    to === "/"
      ? pathname === "/"
      : pathname === to || pathname.startsWith(to + "/");
  return (
    <Button asChild variant={isActive ? "secondary" : "ghost"}>
      <Link to={to}>{children}</Link>
    </Button>
  );
}
