import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

// Better Auth's catch-all handler. When auth is disabled (no BETTER_AUTH_SECRET)
// `auth` is null and every auth path 404s — the rest of the app runs in
// single-user local mode without these endpoints.
const { GET, POST } = auth ? toNextJsHandler(auth) : {
  GET: () =>
    new Response(JSON.stringify({ error: "auth not configured" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  POST: () =>
    new Response(JSON.stringify({ error: "auth not configured" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
};

export { GET, POST };