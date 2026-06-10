# PRE-14 — Flatten try-catch + Zod validation for tailor & edit routes

**Ticket:** PRE-14
**Type of work:** API quality / error handling
**Status:** in progress

## Summary

Flattened the nested try-catch in `/api/edit` into a single try/catch/finally
block (eliminating the confusing outer-try-only-for-finally pattern). Added
Zod request-body schemas to both `/api/tailor` and `/api/edit` so malformed
requests get clean 400 errors with field-level details instead of opaque
"draftId and instruction required" or silent failures.

## Context / problem

`/api/edit` had a confusing nested try-catch:

```ts
try {
  try {
    // all logic
  } catch (e) {
    // error -> response
  }
} finally {
  client.release();
}
```

The inner try handled all errors (Zod + generic); the outer try served no
purpose except to wrap `finally { client.release() }`. This is a smell —
the `finally` should pair with the single `try` that holds the DB client
acquisition.

Meanwhile, neither `/api/tailor` nor `/api/edit` validated request bodies
with Zod schemas. They destructured with manual assertions:

```ts
const { jobDescription } = (await req.json()) as { jobDescription?: string };
if (!jobDescription || !jobDescription.trim()) { ... }
```

This gives a generic "X required" message without field-level details and
doesn't catch type errors (e.g., `jobDescription: 123` passes the truthiness
check but fails downstream confusingly).

## Options considered

### Fix approach

- ✅ **Single try/catch/finally + Zod parse at the top** — matches the
  established pattern in `/api/master/parse-prose` and `/api/master/import`.
  The Zod parse lives outside the DB `try` block so malformed requests never
  acquire a pool connection.
- ❌ **Keep the nested try but add Zod** — reduces the diff but leaves the
  structural smell; future readers will still wonder why there are two try
  blocks.

### Error handling for tailor route

- ✅ **Add catch block (previously missing)** — `/api/tailor` had no catch
  at all; `generateResume` failures would bubble up to Next.js's default
  error handler (generic 500, no details). Added a catch matching the edit
  route's pattern.
- ❌ **Leave as-is** — the LLM call has internal retry, but network failures
  or unexpected errors still need a graceful response.

## Decision

Add Zod schemas (`TailorBody`, `EditBody`) at the top of each route file.
Parse the body before acquiring a DB connection (fail-fast on bad input).
Flatten the edit route to a single try/catch/finally. Add a catch block to
the tailor route for parity.

## Files touched

- `src/app/api/edit/route.ts` — replaced nested try-catch with flat
  try/catch/finally; added `EditBody` Zod schema; body is now accessed via
  `body.draftId` / `body.instruction` (typed, not destructured).
- `src/app/api/tailor/route.ts` — added `TailorBody` Zod schema; added
  missing catch block; body is now accessed via `body.jobDescription`.

## Follow-ups

- [ ] Audit remaining API routes for missing Zod validation
      (`/api/master`, `/api/versions`, `/api/save-fact`, `/api/settings`).
- [ ] Consider extracting a shared `validateBody<T>(req, schema)` helper
      to deduplicate the `try { body = Schema.parse(...) } catch (e) { ... }`
      block that now appears in 4 routes.
