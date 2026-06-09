# APTED-003 — LLM tailoring, editing & extraction

**Ticket:** APTED-003
**Type of work:** LLM integration (Anthropic)
**Status:** shipped

## Summary

Four server-side Claude flows over the resume JSON: **tailor** (master + job
description → tailored draft), **edit** (draft + instruction → revised draft with
undo), **parse-prose** (free text → structured items), and **save-fact** (append
a bullet to a master item). All produce JSON validated by the shared Zod schema,
with a one-shot repair retry and transient-error backoff.

## Context / problem

The core value of apted is turning a master resume into a job-specific one and
letting the user refine it conversationally. The model output must conform to a
strict schema (APTED-002) or the renderer breaks, and it must never fabricate
experience or silently drop the stable ids the editor depends on. The API key
must stay server-side.

## Options considered

### Model

- ✅ **`claude-sonnet-4-6`** — strong instruction-following and JSON fidelity at
  a latency/cost that suits an interactive edit loop.
- ❌ **Opus 4.x** — higher quality ceiling but more latency/cost than this
  schema-shaped transform needs.
- ❌ **Haiku** — cheapest/fastest, but more risk of schema and faithfulness
  regressions on a task where a malformed bullet breaks rendering.

### How structured output is guaranteed

- ✅ **Prompt for raw JSON + parse + one-shot repair retry** — model is told to
  emit JSON only; a regex tolerates accidental code fences; on parse failure a
  single repair prompt is appended and retried once.
- ❌ **Tool use / forced structured output** — would harden schema compliance,
  but adds tool-call plumbing; the prompt-and-repair path was simpler to ship
  and reason about. (Noted as a future hardening option.)

### Prompt structure

- ✅ **System = stable frame + the rules file; user = task + inline JSON
  context** — `TAILOR_FRAME` / `EXTRACT_FRAME` set the contract once, and
  `resume-rules.md` is loaded at server start and embedded so the formatting
  rules live in exactly one place (shared with the renderer).
- ❌ **One monolithic prompt per call** — would duplicate the rules across call
  sites and drift from the renderer's enforcement.

### Conversation memory

- ✅ **Stateless: every edit sends master + current draft + instruction** — the
  draft *is* the state; simple, no server-side chat store, no replay cost.
- ❌ **Replay full conversation history each turn** — burns tokens and couples
  correctness to transcript fidelity when the draft already captures the result.

### Resilience

- ✅ **Exponential backoff (≈500ms·2^i + jitter, ~4 attempts) on 429/5xx/529**
  plus the one-shot JSON repair — handles transient API blips and the occasional
  malformed response without an open-ended retry loop.
- ❌ **No retry** — brittle against rate limits and transient 5xx.
- ❌ **Unbounded repair loop** — risks burning tokens on a model that can't
  recover; one repair attempt is the cap.

### Token economy

- ⚠️ **No prompt caching today** — the system frame + rules are resent each call.
  Caching the system block is an obvious future win (the rules + frame are stable
  across tailor calls) but was not implemented.

## Decision

Sonnet 4.6, stateless full-context requests, prompt-driven JSON with a single
repair retry, and transient-error backoff. The deciding factor was keeping each
call a complete, independently-reasoned transformation: easy to test, easy to
debug, and resilient enough for an interactive tool — accepting that streaming,
tool-use schema enforcement, and prompt caching are deferred optimisations.

## Files touched

- `src/lib/anthropic.ts` — shared Anthropic client + model constant
- `src/lib/llm.ts` — generators, JSON extraction/repair, backoff
- `src/lib/prompts/system.ts` — `TAILOR_FRAME` / `EXTRACT_FRAME` + rules loading
- `src/lib/prompts/user.ts` — user-prompt builders (tailor, edit, import, parse-prose)
- `src/lib/resume-rules.md` — runtime contract embedded in the system prompt
- `src/app/api/tailor/route.ts` — master + JD → tailored draft (DB-backed)
- `src/app/api/edit/route.ts` — draft + instruction → revised draft (pushes undo history)
- `src/app/api/master/parse-prose/route.ts` — prose + kind → items[]
- `src/app/api/save-fact/route.ts` — append a bullet to a master item

## Follow-ups

- [ ] Add prompt caching on the stable system block (frame + rules) to cut repeat-call tokens.
- [ ] Consider tool-use / structured output to make schema compliance guaranteed rather than repaired.
- [ ] No streaming — edits return only when complete; SSE would improve perceived latency.
