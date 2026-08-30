import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { loadSessionUser } from "@/server/session";

/**
 * Read-only auth state for route loaders.
 *
 * `isAuthenticated` means "has an account"; `isAdmin` means "may actually do
 * anything". Almost every caller wants `isAdmin` — a signed-in but unapproved
 * account is intentionally indistinguishable from an anonymous visitor
 * everywhere except the account page.
 */
export const getIsAuthenticated = createServerFn().handler(async () => {
  const user = await loadSessionUser();
  if (!user) {
    return { isAuthenticated: false, isAdmin: false, email: null };
  }
  return {
    isAuthenticated: true,
    isAdmin: user.isAdmin,
    email: user.email,
  };
});

/** Loader guard for the admin area. */
export const forceAdmin = createServerFn().handler(async () => {
  const user = await loadSessionUser();
  if (!user) {
    throw redirect({ to: "/access/signin" });
  }
  if (!user.isAdmin) {
    throw redirect({ to: "/access/pending" });
  }
  return { email: user.email };
});
