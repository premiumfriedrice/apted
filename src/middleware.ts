import { NextResponse, type NextRequest } from "next/server";

// Single gate for every /api/* route:
//   1. Respond to CORS preflight so the browser extension's cross-origin
//      fetches from chrome-extension://<id> pass.
//   2. Require Authorization: Bearer <APTED_AUTH_TOKEN> when that env var is
//      set. The check is skipped when unset so local dev stays frictionless.

const ALLOWED_ORIGIN = "*"; // tighten to chrome-extension://<id> once you have the install
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "content-type, authorization, if-none-match";
const EXPOSED_HEADERS = "etag";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }

  const expected = process.env.APTED_AUTH_TOKEN;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== expected) {
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders())) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
