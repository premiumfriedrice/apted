# PRE-15 — Fix README stale references

**Ticket:** PRE-15
**Type of work:** Documentation
**Status:** in progress

## Summary

Updated `README.md` to match the current file layout after the 007–011
provider/rendering refactors. Removed references to deleted files
(`src/lib/tex.ts`, `src/lib/prompts.ts`, `src/lib/anthropic.ts`), added
the new multi-provider LLM setup, and updated the Files tree and API table.

## Context / problem

The README had several stale references from before the provider-abstraction
and cost-optimization refactors:

1. **LLM line** still said "Anthropic SDK, model `claude-sonnet-4-6`" — now
   provider-agnostic with three backends.
2. **Renderer note** referenced `src/lib/tex.ts` — now at `src/lib/render/`.
3. **System prompt constraints** referenced `src/lib/prompts.ts` — now split
   into `prompts/system.ts` + `user.ts`.
4. **Env vars table** was missing `LLM_PROVIDER`, `OPENAI_API_KEY`,
   `GEMINI_API_KEY`, and all per-flow/per-model overrides.
5. **Files tree** listed `tex.ts`, `prompts.ts`, `anthropic.ts` (all deleted)
   and omitted `providers/`, `render/`, `relevance.ts`, `prompts/`,
   `settings.ts`, `middleware.ts`, `resume-rules.md`.
6. **API table** was missing `/api/master/tex`, `/api/master/pdf`,
   `/api/master/import`, `/api/master/parse-prose`, `/api/settings`.
7. **Page listing** referenced `/library` (removed) and omitted `/settings`.

## Options considered

- ✅ **Update README in place** — single source of truth, keeps the
  onboarding doc accurate.
- ❌ **Delete the Files tree** — less maintenance burden but harder for
  new contributors to orient.

## Decision

Update all stale sections. Keep the Files tree but as a high-level map rather
than an exhaustive listing. Point to `.env.example` for the full env var
reference.

## Files touched

- `README.md` — 6 sections updated (Stack, renderer note, env vars, system
  prompt location, API table, Files tree, page listing).

## Follow-ups

- [ ] The "How it works" section (#2) still says "every prior resume_versions"
      — should say "the top-N relevant prior versions" post-APTED-011.
- [ ] Consider auto-generating the Files tree from a manifest or `ls` script
      to prevent future drift.
