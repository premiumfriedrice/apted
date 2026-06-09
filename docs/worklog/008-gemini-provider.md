# APTED-008 — Gemini 2.0 Flash-Lite support

**Ticket:** APTED-008
**Type of work:** LLM provider — Google Gemini
**Status:** in progress

## Summary

Add Google **Gemini 2.0 Flash-Lite** as a selectable provider via its
OpenAI-compatible endpoint, reusing the `OpenAICompatibleProvider` from
APTED-007. No new SDK.

## Context / problem

Gemini 2.0 Flash-Lite is ~$0.075/$0.30 per 1M tokens (vs. Sonnet 4.6's $3/$15) —
roughly 40× cheaper on output — with Google US hosting, no-training on the paid
API, and native JSON output. It's the recommended cost-down default for a
schema-bound transform like resume tailoring.

## Options considered

### Integration path

- ✅ **Gemini's OpenAI-compatible base URL
  (`/v1beta/openai/`) via the `openai` SDK** — zero new dependency; the same
  adapter that serves OpenAI serves Gemini by swapping `baseURL` + key + model.
- ❌ **`@google/generative-ai` SDK** — a second SDK and a second response shape
  to map, for a model that already speaks the OpenAI shape.

### JSON reliability

- ✅ **`response_format: { type: "json_object" }`** — supported on the
  OpenAI-compatible endpoint; guarantees syntactically valid JSON without
  converting the Zod schema. The shared Zod parse + repair enforces shape.
- ❌ **Full `json_schema` mode now** — stronger, but needs the Resume Zod schema
  translated to a constraints-compliant JSON Schema; deferred (APTED-007 follow-up).

## Decision

Register `gemini` in `getProvider()` pointing the OpenAI-compatible adapter at
`https://generativelanguage.googleapis.com/v1beta/openai/` with
`GEMINI_API_KEY` and a default model of `gemini-2.0-flash-lite` (overridable via
`GEMINI_MODEL`).

## Files touched

- `src/lib/providers/index.ts` — `gemini` case + base URL + default model
- `.env.example` — `GEMINI_API_KEY`, `GEMINI_MODEL`

## Follow-ups

- [ ] Validate JSON-mode reliability on the hardest tailors during the benchmark (APTED-010).
- [ ] Gemini supports implicit context caching; confirm it activates for our stable system prefix or wire explicit caching.
