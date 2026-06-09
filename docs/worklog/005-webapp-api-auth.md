# APTED-005 — Next.js web app, API & auth

**Ticket:** APTED-005
**Type of work:** Web application, REST API, auth/middleware
**Status:** shipped

## Summary

The apted web app: a Next.js App Router project with four pages (library,
builder, master editor, settings), a REST API over the drafts/versions/master/
settings model, live PDF preview via an `<iframe>`, and an optional bearer-token
gate enforced in middleware (plus CORS for the extension).

## Context / problem

apted needs a UI to drive the tailoring loop (paste a JD → generate → refine via
chat → save), a structured editor for the master resume, and a library of saved
versions tagged by outcome. It also needs an API surface the Chrome extension
(APTED-006) can call cross-origin, with a simple way to lock down a deployed
instance without standing up a full identity system.

## Options considered

### Framework / routing

- ✅ **Next.js 15 App Router** — server components by default, colocated
  `route.ts` API handlers, nested layouts; the current Next standard.
- ❌ **Pages Router** — older split of `pages/api` vs `pages/*`; no reason to
  start a new project on it.
- ❌ **Separate SPA + standalone API server** — more moving parts than a single
  Next deployment needs for this scope.

### Auth

- ✅ **Optional bearer token (`APTED_AUTH_TOKEN`) checked in middleware** — if
  set, every `/api/*` call needs `Authorization: Bearer <token>`; if unset, auth
  is skipped (frictionless dev). Stateless, trivial, fits single-user.
- ❌ **Session auth / next-auth / Clerk** — real user identity and multi-tenant
  features, but heavy for a single-user tool with no user model yet.
- ❌ **No auth at all** — fine for local dev, unacceptable for a deployed
  instance; the env-toggle gives both.

### Drafts vs versions data model

- ✅ **Two tables: ephemeral `drafts` (with undo) + archival `resume_versions`
  (with company/role/outcome)** — clean semantics: a draft is a live working
  session you can throw away; a version is a kept snapshot.
- ❌ **One table with a `is_draft` flag** — conflates working state with archive
  and complicates undo + "active draft" tracking.

### Undo history storage

- ✅ **`history` JSONB array on the draft, capped at 20** — push/pop is cheap and
  local to the row; `PATCH /api/drafts/[id]` with `{op:"undo"}` pops it.
- ❌ **Separate revisions table** — needs joins and is slower for an undo-heavy
  edit loop.
- ❌ **Immutable event log** — overkill for "undo my last edit".

### Live PDF preview

- ✅ **`<iframe>` pointed at `/api/drafts/[id]/pdf`, keyed on `updated_at`** —
  the browser's own PDF viewer renders it; bumping the cache key forces a
  recompile+refetch after each edit. No client PDF library.
- ❌ **PDF.js embedded in React** — more control but more client code, state
  sync, and re-render cost for a preview pane.

### Settings storage

- ✅ **Singleton `user_settings` row, upserted; graceful fallback to defaults if
  the table is absent** — survives running before the settings migration.
- ❌ **Per-user settings table** — needs the auth/user model that doesn't exist
  yet.

## Decision

Next.js App Router, two-table drafts/versions model, JSONB undo stack, iframe
PDF preview, and an env-gated bearer token in middleware. The deciding factor
across the board was *right-sized for single-user-but-deployable*: real web-app
structure and a real (if minimal) auth gate, without dragging in identity,
multi-tenancy, or client-side PDF rendering before they're needed. All resume
inputs are validated against the shared Zod schema (APTED-002) at the API edge.

## API surface (as built)

- **Tailor/edit:** `POST /api/tailor`, `POST /api/edit`
- **Drafts:** `GET|PATCH /api/drafts/[id]`, `GET /api/drafts/[id]/tex`, `GET /api/drafts/[id]/pdf`
- **Master:** `GET|PUT /api/master`, `GET /api/master/tex|pdf`, `POST /api/master/import`, `POST /api/master/parse-prose`
- **Versions:** `GET|POST /api/versions`, `GET|PATCH|DELETE /api/versions/[id]`
- **Settings:** `GET|PUT /api/settings`

## Files touched

- `src/middleware.ts` — CORS + optional bearer-token gate over `/api/*`
- `src/app/layout.tsx` — root layout / nav
- `src/app/page.tsx` — library (versions, filter by outcome)
- `src/app/builder/page.tsx` — tailor + chat-refine + live preview + save-as-version
- `src/app/master/page.tsx` — structured master editor (+ JSON view, import)
- `src/app/settings/page.tsx` — template selection
- `src/app/api/**` — REST handlers listed above
- `src/lib/settings.ts` — settings queries with default fallback
- `next.config.mjs` — file-tracing config (ships `resume-rules.md` into the bundle)

## Follow-ups

- [ ] Bearer-token-in-env is single-credential; a real user model would be a larger follow-up (touches APTED-001 singleton rows).
- [ ] Chat history is client-only — closing the builder tab loses the transcript, though the draft persists server-side.
- [ ] CORS is permissive (`*`) to serve the extension; tighten to known origins for a locked-down deployment.
