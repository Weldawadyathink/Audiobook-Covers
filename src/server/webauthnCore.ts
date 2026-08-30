import { createWriteDb } from "@/db.cloudflare";
import { getRequest } from "@tanstack/react-start/server";
import { web_authn_challenge } from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";

/**
 * Relying-party configuration and challenge storage for WebAuthn.
 *
 * No `createServerFn` exports here on purpose — see the note in ./session.ts.
 */

export const RP_NAME = "AudiobookCovers.com";

/**
 * The relying party is derived from the request rather than configured.
 *
 * A passkey is bound to the exact RP ID it was created under, so a hardcoded
 * domain would mean passkeys registered on dev.audiobookcovers.com silently
 * refuse to work on localhost and vice versa. Deriving it per request keeps each
 * environment self-consistent. (Passkeys still do not transfer *between*
 * environments — that is inherent to WebAuthn, not a bug here.)
 */
export function getRelyingParty() {
  const url = new URL(getRequest().url);
  return {
    rpID: url.hostname,
    origin: url.origin,
  };
}

const CHALLENGE_TTL_SECONDS = 300;

export async function saveChallenge(options: {
  challenge: string;
  purpose: "register" | "authenticate";
  email?: string;
  userId?: number;
}) {
  const writeDb = createWriteDb();
  // Expired challenges are useless; clear them out rather than run a job.
  await writeDb
    .delete(web_authn_challenge)
    .where(lt(web_authn_challenge.expires_at, sql`NOW()`));
  await writeDb.insert(web_authn_challenge).values({
    challenge: options.challenge,
    purpose: options.purpose,
    email: options.email ?? null,
    user_id: options.userId ?? null,
    expires_at: sql`NOW() + INTERVAL '${sql.raw(String(CHALLENGE_TTL_SECONDS))} seconds'`,
  });
}

/**
 * Reads a challenge and deletes it in the same statement.
 *
 * The delete is what makes a challenge single-use: without it a captured
 * response could be replayed until the TTL expired.
 */
export async function consumeChallenge(
  challenge: string,
  purpose: "register" | "authenticate",
) {
  const writeDb = createWriteDb();
  const [row] = await writeDb
    .delete(web_authn_challenge)
    .where(
      and(
        eq(web_authn_challenge.challenge, challenge),
        eq(web_authn_challenge.purpose, purpose),
        sql`${web_authn_challenge.expires_at} > NOW()`,
      ),
    )
    .returning({
      challenge: web_authn_challenge.challenge,
      email: web_authn_challenge.email,
      user_id: web_authn_challenge.user_id,
    });
  return row ?? null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
