// Client-safe auth-root-config check. This module intentionally imports
// NOTHING — so bundling it into a "use client" component never drags `pg`,
// kysely, or Better Auth's server runtime into the browser webpack graph.
//
// Reading a non-NEXT_PUBLIC env var in client code evaluates at build time on
// the server and the boolean result is inlined into the client bundle. That's
// exactly what we want here: the client only needs to know *whether* real auth
// is configured, never the secret value.

export const authEnabled = !!process.env.BETTER_AUTH_SECRET;

// Boolean view for clients: is real auth configured?
export function isAuthConfigured(): boolean {
  return authEnabled;
}