import { createServerFn } from "@tanstack/react-start";
import { z } from "zod/v4";
import { eq, sql } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createReadDb, createWriteDb } from "@/db.cloudflare";
import { web_authn_credential, web_user } from "@/db/schema";
import {
  RP_NAME,
  consumeChallenge,
  getRelyingParty,
  normalizeEmail,
  saveChallenge,
} from "@/server/webauthnCore";
import { endSession, loadSessionUser, startSession } from "@/server/session";
import { captureAnalyticsEvent } from "@/server/analyticsCore";

const emailValidator = z.object({
  email: z.email().max(254),
});

/** The browser hands back an opaque credential blob; shape-check happens in the library. */
const credentialValidator = z.object({
  credential: z.unknown(),
});

export const beginRegistration = createServerFn({ method: "POST" })
  .inputValidator(emailValidator)
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const { rpID } = getRelyingParty();
    const writeDb = createWriteDb();

    const [existing] = await writeDb
      .select({ id: web_user.id })
      .from(web_user)
      .where(eq(web_user.email, email))
      .limit(1);

    if (existing) {
      const [credential] = await writeDb
        .select({ id: web_authn_credential.credential_id })
        .from(web_authn_credential)
        .where(eq(web_authn_credential.user_id, existing.id))
        .limit(1);
      if (credential) {
        // Registering a second passkey for an existing account would need the
        // person to prove they own it first, which this flow does not do.
        throw new Error(
          "An account already exists for that email. Sign in instead.",
        );
      }
    }

    // The row is created before the ceremony so the passkey's user handle maps
    // to a stable id. An abandoned registration leaves an inert, credential-less
    // account, which can do nothing.
    const [user] = existing
      ? [existing]
      : await writeDb
          .insert(web_user)
          .values({ email })
          .returning({ id: web_user.id });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(String(user.id)),
      userName: email,
      userDisplayName: email,
      attestationType: "none",
      authenticatorSelection: {
        // Required so sign-in can be a single button with no email typed —
        // the authenticator has to be able to surface the passkey unprompted.
        residentKey: "required",
        userVerification: "preferred",
      },
    });

    await saveChallenge({
      challenge: options.challenge,
      purpose: "register",
      email,
      userId: user.id,
    });

    return options;
  });

export const completeRegistration = createServerFn({ method: "POST" })
  .inputValidator(credentialValidator)
  .handler(async ({ data }) => {
    const { rpID, origin } = getRelyingParty();
    const response = data.credential as Parameters<
      typeof verifyRegistrationResponse
    >[0]["response"];

    const clientChallenge = readClientChallenge(response);
    const pending = await consumeChallenge(clientChallenge, "register");
    if (!pending || pending.user_id == null) {
      throw new Error("That registration expired. Start again.");
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Could not verify that passkey.");
    }

    const { credential } = verification.registrationInfo;
    const writeDb = createWriteDb();
    await writeDb.insert(web_authn_credential).values({
      credential_id: credential.id,
      user_id: pending.user_id,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });

    await startSession(pending.user_id);
    await captureAnalyticsEvent({
      data: {
        eventType: "accountRegistered",
        payload: { userId: pending.user_id },
      },
    });

    return { email: pending.email ?? "" };
  });

export const beginSignIn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { rpID } = getRelyingParty();
    const options = await generateAuthenticationOptions({
      rpID,
      // Empty on purpose: the passkey is discoverable, so the browser offers the
      // account rather than us revealing which emails are registered.
      allowCredentials: [],
      userVerification: "preferred",
    });
    await saveChallenge({
      challenge: options.challenge,
      purpose: "authenticate",
    });
    return options;
  },
);

export const completeSignIn = createServerFn({ method: "POST" })
  .inputValidator(credentialValidator)
  .handler(async ({ data }) => {
    const { rpID, origin } = getRelyingParty();
    const response = data.credential as Parameters<
      typeof verifyAuthenticationResponse
    >[0]["response"];

    const clientChallenge = readClientChallenge(response);
    const pending = await consumeChallenge(clientChallenge, "authenticate");
    if (!pending) {
      throw new Error("That sign-in expired. Try again.");
    }

    const readDb = createReadDb();
    const [stored] = await readDb
      .select({
        credential_id: web_authn_credential.credential_id,
        public_key: web_authn_credential.public_key,
        counter: web_authn_credential.counter,
        transports: web_authn_credential.transports,
        user_id: web_authn_credential.user_id,
        email: web_user.email,
        is_admin: web_user.is_admin,
      })
      .from(web_authn_credential)
      .innerJoin(web_user, eq(web_user.id, web_authn_credential.user_id))
      .where(eq(web_authn_credential.credential_id, response.id))
      .limit(1);

    if (!stored) {
      throw new Error("That passkey is not registered.");
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: stored.credential_id,
        publicKey: isoBase64URL.toBuffer(stored.public_key),
        counter: stored.counter,
        transports: (stored.transports ?? []) as AuthenticatorTransportFuture[],
      },
    });

    if (!verification.verified) {
      throw new Error("Could not verify that passkey.");
    }

    // A counter that fails to advance can indicate a cloned authenticator.
    // Authenticators that always report 0 are normal and exempt.
    const writeDb = createWriteDb();
    await writeDb
      .update(web_authn_credential)
      .set({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: sql`NOW()`,
      })
      .where(eq(web_authn_credential.credential_id, stored.credential_id));

    await startSession(stored.user_id);
    await captureAnalyticsEvent({
      data: {
        eventType: "accountSignedIn",
        payload: { userId: stored.user_id, isAdmin: stored.is_admin },
      },
    });

    return { email: stored.email, isAdmin: stored.is_admin };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { success: true };
});

/** The account page needs its own state before any admin gate applies. */
export const getAccount = createServerFn().handler(async () => {
  const user = await loadSessionUser();
  if (!user) return null;

  const readDb = createReadDb();
  const [passkeys] = await readDb
    .select({ count: sql<number>`count(*)::int` })
    .from(web_authn_credential)
    .where(eq(web_authn_credential.user_id, user.id));

  return {
    email: user.email,
    isAdmin: user.isAdmin,
    passkeyCount: passkeys?.count ?? 0,
  };
});

type AuthenticatorTransportFuture = NonNullable<
  Parameters<typeof verifyAuthenticationResponse>[0]["credential"]["transports"]
>[number];

/**
 * Pulls the challenge back out of the signed client data.
 *
 * The alternative is a second cookie carrying the challenge between the two
 * requests. Reading it from clientDataJSON is equivalent in safety because the
 * value is then checked against the stored single-use row, and the signature
 * over that same client data is verified immediately after.
 */
function readClientChallenge(response: {
  response: { clientDataJSON: string };
}) {
  const clientData = JSON.parse(
    new TextDecoder().decode(
      isoBase64URL.toBuffer(response.response.clientDataJSON),
    ),
  ) as { challenge?: unknown };
  if (typeof clientData.challenge !== "string") {
    throw new Error("Malformed passkey response.");
  }
  return clientData.challenge;
}
