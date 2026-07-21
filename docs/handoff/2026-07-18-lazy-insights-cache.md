# Handoff: Lazy AI Insights Caching for Resume Versions (PRE-88)

**Branch**: `feature/lazy-insights-cache`
**Worktree**: `/Users/lloydalba/code/apted-insights-cache`
**Linear**: PRE-88 (not yet created in Linear — API was failing)
**Date**: 2026-07-18

## Status

**Implemented** (commit `530d3f1` on `feature/lazy-insights-cache`):
- ✅ Migration `0011_insights_cache.sql` (new `resume_insights` table + unique index)
- ✅ `getCachedInsights` / `saveInsights` / `invalidateInsights` in `src/lib/insights.ts`
- ✅ Insights GET route is cache-first and honors `?refresh=true` to force regeneration
- ✅ PATCH `/api/versions/[id]` invalidates cache when `tailoredContent` changes
- ✅ Tests pass: `npx vitest run` (170 passed, 1 skipped) incl. new insights route cache tests
- ✅ Types clean: `npx tsc --noEmit` exits clean
- ❎ Frontend regenerated-button (optional in handoff) — NOT done (out of scope, low value without UI sign-off)

**Remaining verification before merge**:
1. Run `npm run db:migrate` against a seeded DB (no `.env.local` in this worktree, so migration not yet applied). After migrating, inspect the table with `\d resume_insights`.
2. Manual end-to-end: `npm run dev`, open a resume, switch to the Insights tab, confirm it loads; reload and confirm the cached hit is near-instant; `?refresh=true` (or edit the resume) should regenerate.

## What to Build

Cache AI-generated insights for resume versions so they're only generated once per version, and only when the user actually views the insights tab (lazy generation).

### 1. Database: cache table for insights

Create `migrations/0011_insights_cache.sql`:

```sql
CREATE TABLE IF NOT EXISTS resume_insights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  summary     text NOT NULL,
  keywords    jsonb NOT NULL DEFAULT '[]',
  strengths   jsonb NOT NULL DEFAULT '[]',
  tone        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resume_insights_version_user_idx
  ON resume_insights (version_id, user_id);
```

### 2. Backend: cache-aware insights endpoint

Modify `src/app/api/versions/[id]/insights/route.ts`:
- On GET: check if cached insights exist for this version + user
- If cached: return cached insights immediately
- If not cached: generate via LLM, save to cache table, return
- This makes it lazy — insights are only generated when the endpoint is hit, which only happens when the user opens the Insights tab

Modify `src/lib/insights.ts`:
- Add `getCachedInsights(versionId, userId)` and `saveInsights(versionId, userId, insights)` functions
- The `generateInsights` function stays as-is (the LLM call)
- The route handler checks cache first, then falls back to generation

### 3. Model selection

Current state: `src/lib/insights.ts` uses `getProvider()` which resolves to whatever `LLM_PROVIDER` is set (defaults to OpenCode Zen with `claude-sonnet-4-5`).

This is fine for insights — Sonnet is good at summarization. But if cost is a concern, we could use a cheaper model. Options:
- Keep using `getProviderForFlow("edit")` which routes to Sonnet (recommended — insights need quality)
- Use `getStructureProvider()` which routes to DeepSeek v4 flash (cheaper, but lower quality summaries)

Recommendation: use `getProviderForFlow("edit")` (Sonnet) for quality. The cache means each version only pays the LLM cost once.

### 4. Invalidate cache on version update

When a version is updated (PATCH `/api/versions/[id]`), delete the cached insights so they regenerate on next view. Add to the PATCH handler:
```sql
DELETE FROM resume_insights WHERE version_id = $1 AND user_id = $2
```

### 5. Frontend: no changes needed

The resume detail page (`src/app/resumes/[version]/page.tsx`) already lazily fetches insights only when the user clicks the "Insights" tab (line ~107: `if (leftMode !== "insights" ...) return`). The cache is transparent to the frontend — the same endpoint returns faster on subsequent loads.

Optional: add a subtle "cached" indicator or a "Regenerate" button that forces re-generation by passing a `?refresh=true` query param.

## Current State

### Insights endpoint (`src/app/api/versions/[id]/insights/route.ts`)
- Calls `generateInsights()` on every request
- No caching — every visit to the Insights tab costs an LLM call
- Returns `{ summary, keywords, strengths, tone }`

### Insights generation (`src/lib/insights.ts`)
- Uses `getProvider()` (defaults to Sonnet via OpenCode Zen)
- Sends resume content + job context to the LLM
- Parses JSON response into `ResumeInsights` type
- No persistence — results are ephemeral

### Frontend (`src/app/resumes/[version]/page.tsx`)
- Insights tab fetches `/api/versions/${versionId}/insights` on tab open
- Stores result in state (`insights`)
- Does not re-fetch if insights already loaded (guard: `if (insights || insightsLoading) return`)
- This is already lazy — insights only load when the tab is opened

## Key Files

- `migrations/0011_insights_cache.sql` — NEW: cache table
- `src/app/api/versions/[id]/insights/route.ts` — modify: check cache first
- `src/lib/insights.ts` — modify: add cache read/write functions
- `src/app/api/versions/[id]/route.ts` — modify: invalidate cache on PATCH
- `src/app/resumes/[version]/page.tsx` — optional: add regenerate button

## Testing

```bash
cd /Users/lloydalba/code/apted-insights-cache
npm run db:migrate  # run new migration
npx vitest run
npx tsc --noEmit
npm run dev  # test: open a resume, switch to Insights tab, verify it loads
              # then reload and verify it's instant (cached)
```

## Out of Scope

- Dashboard UI cleanup (that's PRE-87, separate worktree)
- Changing the insights UI layout
- Bulk-generating insights for all versions
- Changing the LLM model for insights