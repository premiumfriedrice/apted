# PRE-79 — Add OpenCode Zen as primary LLM provider

**Ticket:** PRE-79
**Type of work:** Feature / infrastructure
**Status:** shipped

## Summary

Added OpenCode Zen (https://opencode.ai/zen/v1) as an OpenAI-compatible provider that routes through multiple model backends. It is now the default provider when `OPENCODE_API_KEY` is configured.

## Context / problem

We originally tried to use OpenCode as a local proxy (localhost:4096), but OpenCode is a TUI coding agent, not an API proxy. The actual API endpoint is OpenCode Zen — a hosted OpenAI-compatible gateway at `https://opencode.ai/zen/v1` that routes to different providers based on model ID (e.g. `claude-sonnet-4-5`, `deepseek-v4-flash`).

We needed:
1. **Quality tailoring** — Opus or Sonnet for bullet rewording and resume editing
2. **Cheap structure selection** — DeepSeek v4 flash for section drop/add decisions
3. **Single API key** — One OpenCode Zen key instead of managing separate Anthropic + DeepSeek keys

## Options considered

### OpenCode as local proxy (localhost:4096)
- ❌ OpenCode is a TUI agent, not an API server. The `server` config key starts a headless TUI server, not an OpenAI-compatible chat completions endpoint.
- Investigated `opencode serve --port 4096` — this starts the ACP (Agent Client Protocol) server, not `/v1/chat/completions`.

### Direct Anthropic + DeepSeek
- ✅ Works, already supported. But requires two separate API keys and two separate SDK clients (Anthropic SDK + OpenAI SDK with different base URLs).
- Somewhat fragile — Anthropic SDK differs from OpenAI SDK, so two adapter implementations.

### OpenCode Zen hosted proxy
- ✅ Single SDK (OpenAI-compatible), single API key, model routing by ID prefix.
- Model IDs are provider-agnostic: `claude-sonnet-4-5`, `deepseek-v4-flash`, `claude-opus-4-5`, etc.
- Uses existing `OpenAICompatibleProvider` adapter — no new SDK needed.
- **Chosen approach.**

## Decision

Implemented OpenCode Zen as a new `ProviderName` (`opencode`) that reuses the OpenAI-compatible adapter. The key details:

- **Base URL**: `https://opencode.ai/zen/v1` (OpenAI-compatible)
- **Model IDs**: Not prefixed with `opencode/` — just the model name (e.g. `claude-sonnet-4-5`, not `opencode/claude-sonnet-4-5`)
- **Auth**: `Authorization: Bearer <OPENCODE_API_KEY>`
- **Default routing**: Sonnet for tailor/edit, DeepSeek v4 flash for structure

When `OPENCODE_API_KEY` is not set, the system falls back to Anthropic direct (for tailor) and DeepSeek direct (for structure).

## Files touched

- `src/lib/providers/index.ts` — Added `opencode` provider, `OPENCODE_BASE_URL`, `OPENCODE_API_KEY`, `getTailorProvider()`, `getStructureProvider()` with OpenCode routing
- `src/lib/providers/index.ts` — `LLM_PROVIDER` defaults to `opencode` when `OPENCODE_API_KEY` is set
- `scripts/benchmark.ts` — Added `opencode: "OPENCODE_API_KEY"` to `KEY_ENV`
- `.env.example` — Added `OPENCODE_API_KEY`, `OPENCODE_BASE_URL`, `OPENCODE_TAILOR_MODEL`, `OPENCODE_STRUCTURE_MODEL`

## Follow-ups

- None currently. If OpenCode adds new models (e.g. GPT-5.5, Gemini 3.5), they're immediately usable by changing the env var — no code changes needed.
- If OpenCode Zen reliability becomes an issue, we can fall back to direct Anthropic + DeepSeek by unsetting `OPENCODE_API_KEY`.