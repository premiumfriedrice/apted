# PRE-16 / PRE-17 / PRE-20 — DB utility consolidation

**Tickets:** PRE-16, PRE-17, PRE-20
**Type of work:** Code quality / deduplication
**Status:** in progress

## Summary

Added shared DB helpers (`withDb()`, `createPool()`) to `src/lib/db.ts`,
eliminating the `pool.connect()` / `client.release()` boilerplate from API
routes and the duplicated `strippedUrl()` + pool creation from three scripts.
Also fixed the benchmark to show which env key is missing when skipping
providers.

## Context / problem

Three overlapping problems:

1. **PRE-16 — `pool.connect()` boilerplate**: Every route that needed multiple
   queries against the same connection did `pool.connect()` / `client.release()`
   manually (~5 lines per route). Forgetting `client.release()` leaks
   connections — a silent footgun.

2. **PRE-17 — `strippedUrl()` duplication**: Three scripts (`migrate.ts`,
   `seed.ts`, `benchmark.ts`) each had their own copy of `strippedUrl()` and
   `new pg.Pool({ connectionString, ssl })`. If the SSL config changed in
   `db.ts`, the scripts would silently diverge.

3. **PRE-20 — opaque benchmark skip message**: When the benchmark skipped a
   provider due to a missing API key, it only showed `"(no key)"` — the user
   had to read the source to know `DEEPSEEK_API_KEY` controls deepseek,
   `ANTHROPIC_API_KEY` controls anthropic, etc.

## Options considered

### `withDb()` design

- ✅ **`withDb(fn: (client) => Promise<T>): Promise<T>` — acquire, call fn,
  release in finally** — the standard pattern used by every connection-pool
  library. Single-responsibility: the route's business logic is a callback,
  the helper handles lifecycle. Only applied to multi-query routes (tailor,
  edit); single-query endpoints keep `pool.query()` (auto acquire+release).
- ❌ **Transaction wrapper** — overkill; these routes don't need atomicity
  across their queries.

### `createPool()` for scripts

- ✅ **Export `createPool()` from `db.ts`** — single source of truth for the
  Supabase-safe SSL config. Scripts import it and get the right pool every
  time. `createPool()` throws if `DATABASE_URL` is missing, so scripts don't
  need their own guard.
- ❌ **Export `strippedUrl` separately** — doesn't add value; the pool config
  is always used together. A single factory is the right abstraction level.

### Benchmark skip message

- ✅ **Show the env var name directly: `(no OPENAI_API_KEY)`** — no extra
  column or mapping. The `KEY_ENV` record already maps provider name to env
  var; just interpolate it.
- ❌ **Add a `getRequiredEnv()` to providers** — adds coupling between the
  provider interface and benchmark concerns; the benchmark already owns the
  mapping.

## Decision

Two exports from `db.ts`: `withDb()` for multi-query routes, `createPool()` for
scripts. The single-query endpoints (drafts, versions, master, save-fact) keep
using `pool.query()` directly — it's already the right pattern for them.

## Files touched

- `src/lib/db.ts` — added `withDb()`, `createPool()`, `PoolClient` type export.
- `src/app/api/tailor/route.ts` — replaced `pool.connect()` / `client.release()`
  with `return await withDb(async (client) => { ... })`.
- `src/app/api/edit/route.ts` — same `withDb()` conversion.
- `scripts/migrate.ts` — replaced local `strippedUrl()` + `new Pool()` with
  `createPool()`.
- `scripts/seed.ts` — same.
- `scripts/benchmark.ts` — same, plus show `KEY_ENV[name]` in skip message.

## Follow-ups

- [ ] Consider wrapping `withDb()` in a transaction variant (`withTransaction()`)
      for routes that need atomic read-then-write (the save-fact route does an
      append-in-app-code pattern that could benefit).
- [ ] The `createPool()` export from `src/lib/db.ts` has a side-effect: importing
      the module creates the app-level `pool` regardless. Consider splitting
      `db.ts` into `db.ts` (app pool + withDb) and `db-config.ts` (createPool,
      strippedUrl) to avoid that.
