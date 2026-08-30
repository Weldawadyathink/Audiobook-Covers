import { createFileRoute, redirect } from "@tanstack/react-router";
import { signOut } from "@/server/authFlow";

export const Route = createFileRoute("/admin/logout")({
  loader: async () => {
    await signOut();
    throw redirect({ to: "/access/signin" });
  },
});
