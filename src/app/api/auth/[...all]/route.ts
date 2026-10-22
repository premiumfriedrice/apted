import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

// Better Auth's catch-all handler. When auth is disabled (no BETTER_AUTH_SECRET)
// `auth` is null and every auth path 404s — the rest of the app runs in
// single-user local mode without these endpoints.
//
// The raw handler surfaces unhandled exceptions as empty-body 500s, which
// leaves nothing in the Vercel logs to diagnose. Wrap both methods so the
// stack trace is logged (server-side) before the 500 goes out.
const fallback = async (): Promise<Response> =>
  new Response(JSON.stringify({ error: "auth not configured" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

function withErrorLogging(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (e) {
      console.error(
        `[auth] unhandled error on ${req.method} ${new URL(req.url).pathname}:`,
        e,
      );
      throw e; // let Next return the 500 — but now the log has the stack
    }
  };
}

const handlers = auth ? toNextJsHandler(auth) : { GET: fallback, POST: fallback };

export const GET = withErrorLogging(handlers.GET);
export const POST = withErrorLogging(handlers.POST);
