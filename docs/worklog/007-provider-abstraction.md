# APTED-007 — Provider-agnostic LLM layer

**Ticket:** APTED-007
**Type of work:** LLM integration — refactor for multi-provider support
**Status:** in progress

## Summary

Refactor the hard-coded Anthropic call path in `src/lib/llm.ts` into a small
provider abstraction so the resume flows (tailor, edit, parse-prose, import) can
run against Claude, OpenAI, or Gemini selected at runtime — without touching the
generators or prompts.

## Context / problem

Tailoring on Sonnet 4.6 costs ~4¢/call. We want to drive that down with cheaper
models and benchmark several against each other (APTED-010). The current code
imports the Anthropic client and `MODEL` directly in `llm.ts`, so swapping or
comparing models means editing core logic. We need a seam.

Security note that shaped this: the app processes candidate **PII**, so model
choice is also a data-residency choice. The abstraction keeps the key server-side
(unchanged) and makes the *provider* an explicit, auditable config value rather
than something buried in a call site.

## Options considered

### Abstraction shape

- ✅ **A thin `Provider` interface (`complete({system, user, maxTokens}) →
  string`) with per-vendor adapters** — generators stay vendor-neutral; retry,
  repair, and Zod validation remain shared in `llm.ts`. Minimal surface.
- ❌ **A heavyweight framework (LangChain etc.)** — pulls in a large dependency
  and its own abstractions for a 3-provider, single-call-shape need.
- ❌ **Inline `if (provider === ...)` branches in `llm.ts`** — re-tangles vendor
  logic with parsing logic; exactly what we're trying to separate.

### How many client SDKs

- ✅ **Two adapters: Anthropic SDK + one OpenAI-compatible adapter** — OpenAI
  *and* Gemini both speak the OpenAI Chat Completions shape, so a single
  `OpenAICompatibleProvider` (base URL + key + model) covers both. Anthropic has
  its own SDK and gets its own adapter.
- ❌ **One SDK per vendor (three adapters)** — needless duplication; Gemini's
  OpenAI-compatible endpoint means the OpenAI adapter is reused verbatim.

### Provider selection

- ✅ **`LLM_PROVIDER` env var + per-provider `*_MODEL` overrides, resolved in a
  cached factory (`getProvider()`)** — switch models with a `.env` change; the
  benchmark passes an explicit provider to compare all three in one run.
- ❌ **Per-request provider in the API body** — leaks model choice to clients
  (including the extension); provider is an operator decision, not a caller one.

### Where retry/repair lives

- ✅ **Keep retry-with-backoff + one-shot JSON repair in `llm.ts`, provider does
  a single call** — the safety net is identical across vendors; each adapter
  surfaces an error with a `.status` the shared backoff understands (both SDKs
  expose `.status`).
- ❌ **Push retry into each adapter** — duplicates the loop and risks divergent
  behavior between providers.

## Decision

A `Provider` interface in `src/lib/providers/` with an `AnthropicProvider` and a
reusable `OpenAICompatibleProvider`, selected by `getProvider()` from
`LLM_PROVIDER`. `llm.ts` keeps all parsing/retry/repair and just calls
`provider.complete(...)`; every generator gained an optional `provider` argument
(defaulting to the configured one) so the benchmark can inject a specific one.

## Files touched

- `src/lib/providers/types.ts` — `Provider` interface + `CompletionRequest`
- `src/lib/providers/anthropic.ts` — Claude adapter (also adds prompt caching, APTED-011)
- `src/lib/providers/openai.ts` — OpenAI-compatible adapter (OpenAI + Gemini)
- `src/lib/providers/index.ts` — `getProvider()` factory + model defaults
- `src/lib/llm.ts` — refactored to call providers; removed direct `MODEL`/client import
- `src/lib/anthropic.ts` — **removed** (client creation moved into the provider factory)
- `.env.example` — `LLM_PROVIDER`, `*_MODEL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`

## Follow-ups

- [ ] Schema-enforced output (`response_format: json_schema` / Anthropic structured outputs) instead of `json_object` + repair — would harden cheap models further. Needs Zod→JSON-Schema conversion.
- [ ] Surface token usage from each adapter so the benchmark can report real cost (see APTED-010).
