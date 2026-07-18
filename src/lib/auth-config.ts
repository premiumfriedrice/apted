// Client-safe auth-root-config check. This module intentionally imports
// NOTHING — so bundling it into a "use client" component never drags `pg`,
// kysely, or Better Auth's server runtime into the browser webpack graph.
//
// Auth is "on" iff BETTER_AUTH_SECRET is set on the server. The secret itself
// can't be shipped to the client (it isn't a NEXT_PUBLIC_ var and must never be),
// but the boolean "is auth enabled?" must be identical on server and client to
// avoid React hydration mismatches (the server would render the authed AppShell
// tree while the client renders the local-mode tree and throw).
//
// Solution: read NEXT_PUBLIC_AUTH_ENABLED. It's set in the Vercel/dotenv
// environment ALONGSIDE BETTER_AUTH_SECRET (just as a "1" mirror) so the same
// boolean value is visible to both runtimes at build time. Falling back to the
// raw BETTER_AUTH_SECRET check keeps the local-dev DX (no need to set the
// mirror var by hand — in dev the secret itself is what we read on the server).

export const authEnabled =
  process.env.NEXT_PUBLIC_AUTH_ENABLED === "1" ||
  !!process.env.BETTER_AUTH_SECRET;

// Boolean view for clients: is real auth configured?
export function isAuthConfigured(): boolean {
  return authEnabled;
}