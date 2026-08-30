import { createReadDb, createWriteDb } from "@/db.cloudflare";
import {
  deleteCookie,
  getCookie,
  getRequest,
  setCookie,
} from "@tanstack/react-start/server";
import { session, web_user } from "@/db/schema";
import { and, eq, gt, lt, sql } from "drizzle-orm";

/**
 * Session plumbing shared by the auth server functions.
 *
 * Deliberately contains no `createServerFn` exports — this module is imported by
 * files that do, and mixing the two in one file breaks tree shaking, so the
 * plain helpers live here instead.
 */

export const SESSION_COOKIE = "abc_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

/** 256 bits from the platform CSPRNG; `node:crypto` is not needed on Workers. */
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cookies must not be marked Secure over plain http or the browser drops them,
 * which would make local development silently fail to log in.
 */
function isSecureRequest() {
  try {
    return new URL(getRequest().url).protocol === "https:";
  } catch {
    return true;
  }
}

export async function startSession(userId: number) {
  const writeDb = createWriteDb();
  const sessionId = randomToken();
  await writeDb.insert(session).values({
    session_id: sessionId,
    user_id: userId,
    expires_at: sql`NOW() + INTERVAL '${sql.raw(String(SESSION_DAYS))} days'`,
  });
  await writeDb
    .update(web_user)
    .set({ last_login_at: sql`NOW()` })
    .where(eq(web_user.id, userId));

  // Opportunistic sweep; there is no scheduled job for this table.
  await writeDb.delete(session).where(lt(session.expires_at, sql`NOW()`));

  setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return sessionId;
}

export async function endSession() {
  const sessionId = getCookie(SESSION_COOKIE);
  if (sessionId) {
    const writeDb = createWriteDb();
    await writeDb.delete(session).where(eq(session.session_id, sessionId));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

/** The signed-in user, or null. Expired sessions count as signed out. */
export async function loadSessionUser(): Promise<SessionUser | null> {
  const sessionId = getCookie(SESSION_COOKIE);
  if (!sessionId) return null;

  const readDb = createReadDb();
  const [row] = await readDb
    .select({
      id: web_user.id,
      email: web_user.email,
      is_admin: web_user.is_admin,
    })
    .from(session)
    .innerJoin(web_user, eq(session.user_id, web_user.id))
    .where(
      and(
        eq(session.session_id, sessionId),
        gt(session.expires_at, sql`NOW()`),
      ),
    )
    .limit(1);

  if (!row) return null;
  return { id: row.id, email: row.email, isAdmin: row.is_admin };
}

/**
 * Guard for every privileged operation.
 *
 * Being signed in is not enough — an account is inert until an admin approves
 * it, so this checks `is_admin` rather than mere session presence.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await loadSessionUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  if (!user.isAdmin) {
    throw new Error("Not authorized");
  }
  return user;
}
