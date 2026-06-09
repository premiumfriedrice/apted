# APTED-009 — OpenAI GPT-4.1-nano / GPT-4o-mini support

**Ticket:** APTED-009
**Type of work:** LLM provider — OpenAI
**Status:** in progress

## Summary

Add OpenAI as a selectable provider (default **GPT-4.1-nano**, swappable to
GPT-4o-mini) through the shared `OpenAICompatibleProvider`.

## Context / problem

OpenAI's small tier (GPT-4.1-nano ~$0.10/$0.40, GPT-4o-mini ~$0.15/$0.60) is
cheap, US-hosted, no-training-by-default on the API, and has the most mature
structured-output support of the cheap options — a strong reliability baseline
to benchmark Gemini and Claude against.

## Options considered

### SDK

- ✅ **Official `openai` SDK** — canonical, typed, and the same adapter Gemini
  reuses. Added as a dependency.
- ❌ **Raw `fetch` against the REST API** — re-implements retries, typing, and
  error shapes the SDK already provides.

### Default model

- ✅ **GPT-4.1-nano as the default, `OPENAI_MODEL` to switch to 4o-mini** —
  cheapest OpenAI option for the first benchmark pass; one env var to trade up
  to 4o-mini if nano under-performs on tailor quality.
- ❌ **Hard-code 4o-mini** — pricier, and the override would still be needed.

## Decision

Register `openai` in `getProvider()` using the `openai` SDK with
`OPENAI_API_KEY`, default model `gpt-4.1-nano` (overridable via `OPENAI_MODEL`),
`response_format: { type: "json_object" }` for JSON safety.

## Files touched

- `package.json` — add `openai` dependency
- `src/lib/providers/openai.ts` — adapter (shared with Gemini)
- `src/lib/providers/index.ts` — `openai` case + default model
- `.env.example` — `OPENAI_API_KEY`, `OPENAI_MODEL`

## Follow-ups

- [ ] Compare nano vs 4o-mini on tailor quality in the benchmark; pick the default empirically (APTED-010).
- [ ] OpenAI auto-caches prompt prefixes >1024 tokens — verify our system prefix qualifies.
