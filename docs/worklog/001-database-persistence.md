# APTED-001 — Database schema & persistence

**Ticket:** APTED-001
**Type of work:** Database schema & persistence
**Status:** shipped

## Summary

Postgres-backed persistence for the whole app: a singleton master resume, a
working-draft table with built-in undo history, an archival versions table with
application outcomes, and a singleton settings row. Accessed through a thin
`pg` connection pool with raw, parameterised SQL — no ORM.

## Context / problem

apted needs to store four very different things: one canonical master resume,
many ephemeral in-progress drafts (each with undo), a library of finalised
tailored resumes tagged by job and outcome, and user settings. The data is
document-shaped (resume JSON) but also needs to be filtered and sorted
(by outcome, by date). The app is single-user for now but is structured as a
real web service, not a local script.

## Options considered

### Database engine

- ✅ **PostgreSQL** — native `jsonb` for the document-shaped resume content,
  `enum` for outcomes, `gen_random_uuid()` for ids, and indexes over jsonb-
  adjacent columns. Standard for a deployable service; pairs with Supabase.
- ❌ **SQLite** — simplest to run locally, but weaker JSON story and an awkward
  fit for a hosted multi-environment deployment.
- ❌ **MySQL** — viable, but the `jsonb` + `enum` + `gen_random_uuid()` ergonomics
  are cleaner in Postgres and the rest of the stack already assumes it.

### Access layer

- ✅ **Raw `pg` (node-postgres) with parameterised queries** — full control,
  zero abstraction, `$1::jsonb` casts and `ON CONFLICT … DO UPDATE` upserts
  written by hand. The schema is small enough that an ORM earns nothing.
- ❌ **Prisma** — nice DX and typed queries, but adds a generated client, a
  schema DSL, and a migration engine for ~4 tables. Overkill.
- ❌ **Drizzle / Kysely** — lighter than Prisma but still an abstraction over
  SQL that is already short and legible here.

### Migrations

- ✅ **Plain numbered `.sql` files run in order, no tracking table** — migrations
  are written idempotently (`IF NOT EXISTS`, `ON CONFLICT … DO NOTHING`) so they
  are safe to re-run; `scripts/migrate.ts` reads `migrations/*.sql`
  lexicographically and executes each.
- ❌ **A migration framework with a `_migrations` ledger** — buys ordering and
  "already applied" tracking, but the idempotent-SQL approach gets the same
  safety without the dependency or the bookkeeping table.

### Connection model

- ✅ **Pooled connections (`pg.Pool`)** — handles concurrent API requests;
  `/api/tailor` checks out a client explicitly for its multi-statement work and
  releases in `finally`.
- ❌ **Single long-lived connection** — would serialise concurrent requests and
  is fragile under a serverless/edge runtime.

### Multi-tenancy shape

- ✅ **Singleton rows (`id = 1`) for master resume and settings** — encodes the
  single-user assumption directly in the schema; unambiguous and prevents
  accidental duplicates.
- ❌ **Nullable `owner_id` / app-level enforcement** — premature; would invite
  multi-user bugs before there is auth or a user model.

## Decision

Postgres + raw `pg` + idempotent numbered SQL migrations. The deciding factor
was that the data is document-shaped *and* queryable, which Postgres `jsonb`
serves directly, while the schema is small enough that any ORM or migration
framework would be pure overhead. SSL is forced on with `rejectUnauthorized:
false` and `sslmode`/`ssl` query params are stripped from `DATABASE_URL` for
Supabase pooler compatibility.

## Schema as built

- **`master_resume`** — `id` (singleton), `content` jsonb, `updated_at`.
- **`resume_versions`** — `id` uuid, `company`, `role`, `job_description`,
  `tailored_content` jsonb, `outcome` enum (`draft|applied|interview|offer|rejected`),
  `created_at`; indexed on `outcome` and `created_at DESC`.
- **`drafts`** — `id` uuid, `job_description`, `content` jsonb, `history` jsonb
  (array of prior snapshots, capped at 20 in app code), `created_at`, `updated_at`.
- **`user_settings`** — `id` (singleton), `template` (default `jake`), `updated_at`.

## Files touched

- `migrations/0001_init.sql` — master_resume, resume_versions, drafts, outcome enum
- `migrations/0002_user_settings.sql` — user_settings table + seed row
- `src/lib/db.ts` — `pg.Pool` singleton, URL parsing, SSL config
- `scripts/migrate.ts` — runs `migrations/*.sql` in order
- `scripts/seed.ts` — seeds an empty master resume row
- `src/lib/settings.ts` — `getUserSettings` / `setUserSettings`, falls back to defaults if the table is missing

## Follow-ups

- [ ] No migration ledger — re-running relies on every migration staying idempotent. Revisit if a non-idempotent change is ever needed.
- [ ] Singleton-row model will need rework if/when multi-user auth lands (see APTED-005).
