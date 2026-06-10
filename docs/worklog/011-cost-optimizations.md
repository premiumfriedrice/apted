# APTED-011 — Cost optimizations: prompt caching + relevant prior versions

**Ticket:** APTED-011
**Type of work:** LLM cost/quality optimization
**Status:** in progress

## Summary

Two model-independent cost cuts on the tailoring path: (1) cache the stable
system prompt so it isn't billed at full price on every call, and (2) send only
the prior tailored versions *relevant* to the current job description instead of
the 20 most recent.

## Context / problem

Two things inflate tailor cost and (for #2) hurt quality:

1. The system block (`TAILOR_FRAME` + the whole `resume-rules.md`) is resent at
   full input price on every tailor and edit call, even though it's byte-identical
   across calls.
2. `/api/tailor` sends up to **20** prior tailored versions as "framing hints."
   That's a large input chunk, and it's indiscriminate — a platform-engineering
   resume shouldn't be framing-context for a mobile-development JD. Wrong-domain
   examples cost tokens *and* can pull the tailoring in the wrong direction.

## Options considered

### Prompt caching

- ✅ **Mark the Anthropic system block `cache_control: ephemeral`; rely on
  automatic prefix caching for OpenAI/Gemini** — the system prefix is stable, so
  repeat calls read it at ~0.1×. Provider-appropriate: Anthropic needs the
  explicit marker; OpenAI auto-caches >1024-token prefixes; Gemini caches
  implicitly.
- ❌ **No caching** — leaves the largest, most repetitive input billed at full
  price on every call.

### Selecting prior versions

- ✅ **Keyword/tag overlap heuristic** — score each version by overlap between
  the JD tokens and the version's `role` + the resume items' `tags` + skill text;
  keep the top K (default 5). No extra API call, no new dependency, directly
  targets the wrong-domain problem.
- ❌ **Embeddings similarity** — more robust to wording, but adds an embeddings
  provider + dependency + per-call cost; overkill for a v1 and against the
  cost-cutting goal.
- ❌ **Let the model pick from all 20** — spends tokens on exactly the context
  we're trying to trim.
- ❌ **Just take the most recent N** — cheaper than 20 but still domain-blind
  (the platform-vs-mobile problem persists).

### Where ranking runs

- ✅ **A pure `rankPriorVersions()` helper called in `/api/tailor`** before the
  prompt is built — testable, no I/O, easy to swap for embeddings later behind
  the same signature.
- ❌ **Rank inside the SQL query** — overlap scoring over JSONB tags is awkward
  and ties the heuristic to the database.

## Decision

Add `cache_control` to the Anthropic adapter's system block (APTED-007), and add
`src/lib/relevance.ts` with `rankPriorVersions(jd, versions, topK=5)` scoring by
JD↔(role + tags + skills) token overlap. `/api/tailor` still fetches the recent
20 but ranks them down to the top 5 before sending. Ties break toward more recent.

## Files touched

- `src/lib/providers/anthropic.ts` — `cache_control: ephemeral` on the system block
- `src/lib/relevance.ts` — `rankPriorVersions()` + tokenizer
- `src/app/api/tailor/route.ts` — rank the fetched versions before building the prompt

## Follow-ups

- [ ] Make `topK` and the recency-vs-relevance weighting configurable.
- [ ] Swap the heuristic for embeddings behind the same `rankPriorVersions` signature if overlap proves too brittle.
- [ ] Verify cache hits via `usage.cache_read_input_tokens` once usage is surfaced (APTED-010).
