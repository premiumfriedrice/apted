# PRE-18 / PRE-22 — Extension types fix + shared type consolidation

**Tickets:** PRE-18, PRE-22
**Type of work:** Type system / code quality
**Status:** in progress

## Summary

Fixed the extension types to match the server-side Zod schemas (added `tags`,
`achievements` section kind, `AchievementItem` type). Eliminated the inline
`Draft` type from the builder page by exporting shared `Draft` and `Version`
interfaces from `src/lib/resume.ts` — the single source of truth for API
response shapes.

## Context / problem

The same types were duplicated in three places:

1. **`src/lib/resume.ts`** — Zod schemas + inferred types (server, canonical)
2. **`src/app/builder/page.tsx`** — inline `type Draft` with a subset of fields
3. **`extension/src/types.ts`** — standalone TS types with several drift issues:
   - Missing `tags?: string[]` on `ExperienceItem`, `ProjectItem`, `EducationItem`
   - Missing `AchievementItem` type entirely
   - Missing `achievements` section kind from the `Section` discriminated union
   - `Contact` had `phone?: string` but server has `phone: string` with `.default("")`

Every schema change needed manual sync across all three places, and the
extension types had silently drifted — the renderer wouldn't handle
achievements properly.

## Options considered

### Fix approach

- ✅ **Fix extension types in place + export shared API shapes from server** —
  minimal diff, no new dependencies, single source of truth for API responses.
  The extension keeps its own types (it can't import from the Next.js app), but
  they now match the server schemas.
- ❌ **Extract a shared `@apted/types` package** — ideal but adds build
  complexity (workspace config, publishing, versioning) disproportionate to
  the current project stage.
- ⚠️ **Use `zod-to-ts` to auto-generate `.d.ts`** — generates exact types but
  requires a build step; deferred as a follow-up.

### Where to put Draft/Version types

- ✅ **In `src/lib/resume.ts`** — same module as the `Resume` type they compose
  with. Colocation beats a separate "types barrel" file since the API shapes
  are tightly coupled to the Resume schema.
- ❌ **New `src/lib/types.ts`** — splits types across two modules for no
  benefit at this scale.

## Decision

Fix extension types to match the server schemas (add `tags`, `AchievementItem`,
`achievements` section kind). Export `Draft` and `Version` interfaces from
`resume.ts` so the builder page imports them instead of defining inline copies.

## Files touched

- `extension/src/types.ts` — added `tags?: string[]` to Experience/Project/
  Education items; added `AchievementItem` type; added `achievements` to the
  `Section` discriminated union.
- `src/lib/resume.ts` — exported `Draft` and `Version` interfaces alongside
  the existing type exports.
- `src/app/builder/page.tsx` — replaced inline `Draft` type with import from
  `@/lib/resume`.

## Follow-ups

- [ ] Write a type-level test that validates extension types are assignable to
      server types (PRE-22 acceptance criteria).
- [ ] Consider `zod-to-ts` or a CI check that flags drift between extension
      types and server schemas.
- [ ] The extension's `Contact.phone` is `string | undefined` but the server's
      is `string` (defaults to `""`). This is harmless at runtime (API always
      sends a string) but worth noting for strict mode.
