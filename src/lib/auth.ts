// Better Auth configuration (PRE-86).
//
// Auth is OPTIONAL by design: when BETTER_AUTH_SECRET is unset, the app runs in
// a single-user "local" mode where every API route resolves user_id to the
// sentinel LOCAL_USER_ID. This keeps local dev and the test suite frictionless
// (no DB-backed auth tables required) and matches the existing optional-
// APTED_AUTH_TOKEN philosophy. Set BETTER_AUTH_SECRET (+ OAuth vars) in prod to
// enable real multi-tenant auth.
//
// When enabled:
//   - Email/password + Google + GitHub sign-in (Google/GitHub only if their
//     client creds are set).
//   - Cookie sessions for the web app.
//   - Bearer-token sessions for the Chrome extension (better-auth/plugins/bearer)
//     so the extension can send `Authorization: Bearer <token>` and be
//     validated via auth.api.getSession({ headers }).

import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { Kysely, PostgresDialect } from "kysely";
import { pool } from "./db";
import { authEnabled } from "./auth-config";

// Sentinel user id used when auth is disabled (local dev / tests). The
// migration backfills existing rows with this value so current data stays
// reachable in local mode.
export const LOCAL_USER_ID = "local";

export { authEnabled };

const socialProviders: NonNullable<
  Parameters<typeof betterAuth>[0]["socialProviders"]
> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

function buildAuth() {
  const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    // When BETTER_AUTH_URL is unset, let Better Auth infer the base URL from
    // the request headers (x-forwarded-host etc.) — correct on Vercel AND in
    // local dev. A hard fallback to http://localhost:3000 makes production
    // believe it lives on localhost, which is a footgun for the social
    // sign-in flow (empty 500s on /api/auth/sign-in/social).
    baseURL: process.env.BETTER_AUTH_URL || undefined,
    database: { db, type: "postgres" },
    emailAndPassword: { enabled: true },
    // Cookie sessions for browsers; bearer plugin layers bearer-token
    // acceptance on top of the same session lookup for the extension.
    session: {
      // 30 days. A separate long-lived token can be minted for the extension
      // via /api/auth/extension-token.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24, // refresh once per day
    },
    socialProviders,
    plugins: [bearer()],
  });
}

// null when auth is disabled (LOCAL_USER_ID mode). The auth route handler and
// requireUserId both treat null as "auth off".
export const auth: ReturnType<typeof buildAuth> | null = authEnabled ? buildAuth() : null;

// Resolve the user id for a request.
//
// - Auth disabled → LOCAL_USER_ID (always; never null).
// - Auth enabled  → the authenticated user id, or null if no valid session.
//
// Routes call this and return 401 when null and authEnabled. In local mode the
// value is guaranteed non-null so routes can use it directly.
export async function requireUserId(req: Request): Promise<string | null> {
  if (!auth) return LOCAL_USER_ID;
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id ?? null;
}