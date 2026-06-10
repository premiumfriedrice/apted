# PRE-8 — Schema-enforced structured output across providers

**Ticket:** PRE-8
**Type of work:** LLM reliability
**Status:** shipped

## Summary

All providers now receive the Resume (and envelope) Zod schemas as formal
structured-output constraints. Anthropic and OpenAI/Gemini instruct the model to
return JSON conforming to the expected shape, reducing the chance that cheap
models drift from the schema and trigger the repair retry. The Zod parse in
`llm.ts` remains as a backstop.

## Context / problem

The cheap providers (GPT-4.1-nano, Gemini 2.0 Flash-Lite) were more likely to
drift from the Resume shape (wrong field names, missing required fields, extra
properties). The existing "loose JSON mode" (`response_format: json_object`)
guaranteed syntactically valid JSON but didn't enforce the shape. Every drift
forced a second repair call, doubling the cost and latency.

## Options considered

### How to pass the schema to providers

- ✅ **Add optional `schema?: z.ZodType` to `CompletionRequest`** — the
  generators in `llm.ts` already hold the Zod schemas; passing them through
  the request keeps the providers generic and the schema knowledge in the
  domain layer.
- ❌ **Have providers import the Resume schema directly** — couples the
  provider layer to domain types; the providers are supposed to be
  resume-agnostic.

### How to convert Zod → JSON Schema

Both Anthropic and OpenAI expect a standard JSON Schema object, but each has
different tolerance for advanced features:

| Feature | Anthropic | OpenAI |
|---------|-----------|--------|
| `anyOf` / `oneOf` | ❌ Rejects | ❌ Rejects (strict mode) |
| `$schema` | ❌ Rejects | ✅ Ignores |
| `default` | ❌ Rejects | ❌ Rejects (strict mode) |
| `definitions` / `$ref` | ❌ Rejects | ✅ Resolves |

- ✅ **`zod-to-json-schema` + custom sanitizer** — generates a faithful JSON
  Schema from the Zod schema, then strips unsupported features (collapses
  `anyOf` to first branch, removes `$schema`, `default`, `definitions`).
  Single code path for both providers.
- ❌ **Anthropic's `zodOutputFormat()` (non-exported helper)** — the SDK
  mentions it in docs but doesn't export it from the public API.
- ❌ **Manual JSON Schema** — duplicates the Zod schema; fragile when the
  schema changes.
- ❌ **Only enable for OpenAI (skip Anthropic)** — Claude already outputs
  clean JSON reliably, but consistency across providers is valuable, and
  the schema hint costs nothing.

### `anyOf` handling for discriminatedUnion

The Resume schema uses `z.discriminatedUnion("kind", [...])` which generates
a 5-branch `anyOf` for sections. This is too complex for both providers.

- ✅ **Collapse `anyOf` to the first branch** — the model sees the structure
  of the first variant (experience) as a template. It still has the system
  prompt describing all five section kinds, so it knows to generate all of
  them. The collapsed schema serves as a structural hint, not the sole source
  of truth.
- ❌ **Build a flattened "section" type with optional fields for all kinds** —
  loses the discriminated union semantics and might confuse the model more.

## Decision

`CompletionRequest` now carries an optional `schema: z.ZodType`. A shared
`toProviderJsonSchema()` helper converts Zod → sanitized JSON Schema (strip
unsupported features, collapse `anyOf` → first branch). Each provider passes
the sanitized schema via its native mechanism:
- Anthropic: `output_config.format = { type: "json_schema", schema }`
- OpenAI/Gemini: `response_format = { type: "json_schema", json_schema: { name, schema } }`

When no schema is provided (backward-compatible), providers fall back to
loose JSON mode.

**Tradeoff:** Structured output disables Anthropic's prompt caching (the
`output_config` changes the cache key). On the first run, cache-read tokens
dropped from ~2,900 to 0. This is acceptable for now — the cost savings from
avoiding repair retries with cheap models outweighs the cache loss. Cache
behavior may improve as the API evolves.

## Files touched

- `src/lib/providers/types.ts` — added `schema?: z.ZodType` to
  `CompletionRequest`
- `src/lib/providers/schema.ts` — new: `toProviderJsonSchema()` with
  sanitization logic
- `src/lib/providers/anthropic.ts` — pass sanitized schema via
  `output_config.format`
- `src/lib/providers/openai.ts` — pass sanitized schema via
  `response_format.json_schema`
- `src/lib/llm.ts` — wire schema through `callModel` → `callAndParse` →
  all four public generators + `selectStructure`
- `package.json` — new dependency: `zod-to-json-schema`

## Follow-ups

- [ ] Test with fresh OpenAI/Gemini keys to confirm `json_schema` mode works
  (DeepSeek may not support structured output — the schema is still passed
  but the provider may ignore it)
- [ ] Verify schema sanitizer doesn't lose critical structure (the
  `anyOf` → first-branch collapse is lossy — the model relies on the
  system prompt for the full shape)
- [ ] Investigate if Anthropic caches `output_config` in future API versions
