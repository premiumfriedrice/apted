import { NextResponse, type NextRequest } from "next/server";

// Single gate for every /api/* route:
//   1. Respond to CORS preflight so the browser extension's cross-origin
//      fetches from chrome-extension://<id> pass.
//   2. Require Authorization: Bearer <APTED_AUTH_TOKEN> when that env var is
//      set. The check is skipped when unset so local dev stays frictionless.
//
// Note (PRE-86): Better Auth session validation is NOT done here. Next.js
// middleware runs in the edge runtime, which can't reach Postgres via pg, so
// each /api/* route resolves the user id via requireUserId() instead. The
// legacy APTED_AUTH_TOKEN gate is kept as an optional deployment-side fence
// and is bypassed for /api/auth/* so sign-up/sign-in aren't blocked before a
// session exists.

// Comma-separated list of allowed origins. Defaults to "*" when unset (local
// dev). In production, set to the Chrome extension origin(s) + Vercel domain:
//   ALLOWED_ORIGINS=chrome-extension://abcd1234,https://apted.vercel.app
// The preflight handler returns the matching origin (not "*") when a specific
// list is configured, which is required for credentialed requests.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "content-type, authorization, if-none-match";
const EXPOSED_HEADERS = "etag";

function resolveOrigin(requestOrigin: string | null): string {
  // No specific allowlist → wildcard (frictionless dev mode).
  if (ALLOWED_ORIGINS.length === 0) return "*";
  // If the request carries an Origin and it's in the list, echo it back.
  // This is required for credentialed requests (credentials: "include") and
  // is more secure than "*" for production.
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  // Request origin not in the list - return the first configured origin as a
  // safe fallback (the browser will reject the response if it doesn't match
  // the request's origin, which is the desired behavior).
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(origin),
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const expected = process.env.APTED_AUTH_TOKEN;
  // Better Auth's own endpoints (sign-in, sign-up, callback, get-session) must
  // be reachable before a session exists, so skip the bearer gate for them.
  // The Stripe webhook is called by Stripe (not a logged-in user) and verifies
  // its own signature via the raw body, so it must also bypass this gate (PRE-93).
  // When Better Auth is configured, ALL API routes use Better Auth session
  // validation (via requireUserId in each route) — the legacy APTED_AUTH_TOKEN
  // gate is only for local mode without auth.
  const isAuthEndpoint = req.nextUrl.pathname.startsWith("/api/auth/");
  const isStripeWebhook = req.nextUrl.pathname === "/api/stripe/webhook";
  const authConfigured = process.env.BETTER_AUTH_SECRET || process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";
  if (expected && !isAuthEndpoint && !isStripeWebhook && !authConfigured) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== expected) {
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", ...corsHeaders(origin) },
      });
    }
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
