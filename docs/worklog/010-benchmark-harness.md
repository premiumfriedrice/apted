# APTED-010 — Multi-model benchmark harness

**Ticket:** APTED-010
**Type of work:** Tooling — model evaluation
**Status:** in progress

## Summary

A standalone script that runs the **same** tailoring input through every
configured provider (Claude / OpenAI / Gemini) and reports latency and
schema-validity per model, so the cost-down model choice is made on evidence,
not vibes.

## Context / problem

We're switching the default tailoring model to something cheaper (APTED-007–009).
Before committing, we need a like-for-like comparison: does the cheap model still
produce a valid, faithful, one-page-worthy tailored resume? A repeatable harness
makes that decision data-driven and re-runnable when models or prompts change.

## Options considered

### What to measure

- ✅ **Latency + schema-valid (does it Zod-parse) per provider, same input** —
  the two cheapest-to-capture, highest-signal axes for a first pass. Validity is
  the make-or-break property for a schema-bound pipeline.
- ⚠️ **Token/cost capture** — the real goal, but the unified `Provider.complete`
  returns only text today. Deferred until adapters surface `usage` (APTED-007
  follow-up); for now cost is estimated from published per-token prices.
- ⚠️ **Output *quality* scoring** (faithfulness, JD match) — needs an LLM judge
  or human review; out of scope for v1, noted as a follow-up.

### Harness form

- ✅ **A `tsx` script (`scripts/benchmark.ts`), like `migrate`/`seed`** — matches
  the repo's existing script convention; reads the master resume from the DB and
  a JD from a file/arg, loops providers, prints a table. Providers missing a key
  are skipped, not failed.
- ❌ **A test-suite integration** — couples model evaluation to CI and burns API
  spend on every run; benchmarking is an on-demand activity.

## Decision

`scripts/benchmark.ts` (+ an `npm run benchmark` script) that pulls the master
resume + recent versions from the DB, takes a JD path as an argument, and runs
`generateResume` against each provider via the injectable `provider` argument,
timing each and reporting parse success. Missing-key providers are skipped.

## Files touched

- `scripts/benchmark.ts` — the harness
- `package.json` — `benchmark` script

## Follow-ups

- [ ] Add token/cost reporting once adapters surface `usage`.
- [ ] Add an LLM-judge quality pass (faithfulness + JD-match) over the outputs.
- [ ] Run across a fixture set of diverse JDs (platform vs mobile vs data) rather than a single JD.
