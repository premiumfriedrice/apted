# PRE-19 — CORS middleware: tighten ALLOWED_ORIGIN from "*" to configurable list

**Ticket:** PRE-19
**Type of work:** Security
**Status:** in progress

## Summary

Replaced the hardcoded `ALLOWED_ORIGIN = "*"` in `src/middleware.ts` with an
env-configurable `ALLOWED_ORIGINS` (comma-separated). When a specific list is
configured, the middleware echoes back the matching request origin instead of
`"*"` — required for credentialed requests and more secure for production.
When unset, falls back to `"*"` for frictionless local dev.

## Context / problem

The middleware set `Access-Control-Allow-Origin: *` unconditionally. This:

1. Is overly permissive for production — any origin can hit the API.
2. Breaks credentialed requests (cookies, `Authorization` with
   `credentials: "include"`) because browsers forbid `*` with credentials.
3. Leaves no mechanism to restrict to the known Chrome extension origin and
   Vercel deployment domain.

## Options considered

### Origin resolution logic

- ✅ **Env-configurable list; echo matching origin; default to `"*"`** — the
  standard pattern for multi-origin CORS. When the list is empty (dev), every
  request gets `"*"`. When configured, only listed origins pass, and the
  response echoes the matching origin (required for credentialed fetches).
- ❌ **Single `ALLOWED_ORIGIN` env var** — doesn't support the common case
  of both a Chrome extension origin and a Vercel domain.
- ❌ **Hardcoded origin** — need the extension ID at build time, which is
  a deployment hassle.

### Fallback when origin not in list

- ✅ **Return the first configured origin** — the browser will reject it
  (mismatch), which is the correct behavior for an unauthorized origin.
- ❌ **Return `"null"`** — same effect but less clear in debugging.

## Decision

`ALLOWED_ORIGINS` env var (comma-separated). `resolveOrigin(requestOrigin)`
returns `"*"` when the list is empty, the matching origin when found, or the
first list entry as a safe rejection fallback.

## Files touched

- `src/middleware.ts` — replaced `ALLOWED_ORIGIN` constant with
  `ALLOWED_ORIGINS` array + `resolveOrigin()` function. Updated `corsHeaders()`
  to accept the request origin and echo the matching origin.
- `.env.example` — documented `ALLOWED_ORIGINS` with example values.

## Follow-ups

- [ ] Set `ALLOWED_ORIGINS` in the deployment environment with the actual
      Chrome extension ID and Vercel domain.
- [ ] Verify the extension's `chrome-extension://` origin passes the CORS
      check after deployment.
