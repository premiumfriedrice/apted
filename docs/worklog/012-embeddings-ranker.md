# PRE-11 — Embeddings-based relevance ranker

**Ticket:** PRE-11
**Type of work:** LLM cost/quality optimization
**Status:** in progress

## Summary

Added an embeddings-based relevance ranker as an opt-in alternative to the
keyword-overlap heuristic. When `TAILOR_RANKER=embeddings`, `/api/tailor`
ranks prior versions by cosine similarity of OpenAI `text-embedding-3-small`
vectors instead of token overlap. The keyword ranker remains the default; the
call site (`/api/tailor`) needs zero conditional logic — it calls
`await rankPriorVersions(...)` and the function dispatches internally.

## Context / problem

The keyword-overlap ranker (APTED-011) works well for clear domain matches
(e.g., "iOS" ↔ "iOS") but is brittle against synonyms and paraphrasing
("shipped mobile apps" vs "iOS development"). An embeddings ranker captures
semantic similarity: "Kubernetes" and "container orchestration" match without
shared tokens.

The acceptance criteria require the embeddings ranker to be (1) opt-in, (2)
behind the same `rankPriorVersions` signature, and (3) swappable without
touching `/api/tailor`.

## Options considered

### Embeddings provider

- ✅ **OpenAI text-embedding-3-small** — we already ship the OpenAI SDK for
  the provider layer; the embeddings API is a simple REST call; $0.02/1M
  tokens (~$0.0001 per resume profile). No new dependency.
- ❌ **Gemini embedding-001** — requires a separate SDK or raw REST; the
  Gemini provider in our stack goes through the OpenAI-compatible endpoint,
  which doesn't expose embeddings. Adds a second auth path.
- ❌ **Local model (e.g., all-MiniLM-L6-v2 via transformers.js)** — zero API
  cost but adds a heavy Node dependency (~50MB model) and cold-start latency;
  against the cost-cutting spirit for a v1.

### Call pattern

- ✅ **Individual `fetch` calls in parallel (`Promise.all`)** — OpenAI accepts
  up to 2048 inputs in a batch call, but for ≤20 versions the parallelism is
  identical (the API processes them concurrently either way). Individual calls
  are simpler to retry and debug.
- ❌ **Single batch embedding call** — same latency but adds per-item error
  mapping; only worth it at scale (100+ versions).

### Sync vs async public API

- ✅ **`PriorVersion[] | Promise<PriorVersion[]>` return type, await at
  call site** — the keyword path returns synchronously (no overhead), the
  embeddings path returns a Promise. Both call sites (`/api/tailor`,
  `scripts/benchmark.ts`) already live in async functions so `await` costs
  nothing. TypeScript 5.9's `Awaited<T>` handles the union transparently.
- ❌ **Always async return** — forces a microtask on the keyword path for no
  benefit.
- ❌ **Separate `rankPriorVersionsByEmbeddings` export** — violates the
  "swappable without touching /api/tailor" requirement; the route would need
  an `if` to pick the function.

### Missing-key handling

- ✅ **Silent fallback to keyword ranker + `console.warn`** — if
  `TAILOR_RANKER=embeddings` is set but `OPENAI_API_KEY` is missing, the
  system degrades gracefully rather than breaking the tailor flow.
- ❌ **Throw** — a missing key shouldn't block the tailor flow; the user may
  have forgotten to set the key after toggling the ranker in a different env.

## Decision

A single `rankPriorVersions` dispatch function that reads `TAILOR_RANKER` at
call time and delegates to either `rankByKeywords` (default, sync) or
`rankByEmbeddings` (opt-in, async). The call sites only add `await` — no
conditional logic, no new imports. The embeddings ranker uses a direct
`fetch` to the OpenAI embeddings endpoint (no SDK dependency) with parallel
calls and a `slice(0, 8000)` safeguard against the 8191-token limit.

## Files touched

- `src/lib/relevance.ts` — added `getEmbedding()`, `cosineSimilarity()`,
  `rankByEmbeddings()`; renamed original to `rankByKeywords`; new `rankPriorVersions`
  dispatch function with `TAILOR_RANKER` env check.
- `src/app/api/tailor/route.ts` — added `await` before `rankPriorVersions(...)`.
- `scripts/benchmark.ts` — added `await` before `rankPriorVersions(...)`.
- `.env.example` — documented `TAILOR_RANKER` env var.

## Follow-ups

- [ ] Run the benchmark with `TAILOR_RANKER=embeddings` on a diverse JD set
      and compare ranking quality vs keyword overlap.
- [ ] Consider a hybrid ranker: embeddings for semantic similarity, keywords
      for exact-match boost (e.g., language/framework names).
- [ ] Cache embeddings for the master resume and prior versions to avoid
      re-embedding on every tailor call (the versions are stable).
