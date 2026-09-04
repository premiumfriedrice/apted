// Provider factory. Resolves which model backend to use from env and caches one
// instance per (userId, provider) so multi-tenant BYOK keys don't bleed.
// Generators in llm.ts call getProvider() (honoring LLM_PROVIDER); the
// benchmark passes an explicit name to compare all three.
//
// Never import this from a client component - it constructs API clients holding
// server-only keys.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai";
import type { Provider } from "./types";
import { resolveApiKey, getApiKey } from "../api-keys";

export type ProviderName = "anthropic" | "openai" | "gemini" | "deepseek" | "opencode";
export type { Provider } from "./types";

export const PROVIDER_NAMES: ProviderName[] = ["anthropic", "openai", "gemini", "deepseek", "opencode"];

// Google exposes an OpenAI-compatible surface here, so the OpenAI adapter works
// verbatim against Gemini.
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

// DeepSeek is OpenAI-compatible - same adapter as Gemini.
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

// OpenCode Zen is an OpenAI-compatible proxy at https://opencode.ai/zen/v1.
// It routes to different providers based on the model prefix:
//   anthropic/claude-sonnet-4-5, deepseek/deepseek-v4-flash, etc.
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/v1";

// Per-provider model defaults. Override any of them with the matching *_MODEL
// env var without touching code.
function defaultModel(name: ProviderName): string {
  switch (name) {
    case "anthropic":
      return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250514";
    case "openai":
      return process.env.OPENAI_MODEL ?? "gpt-4.1-nano";
    case "gemini":
      return process.env.GEMINI_MODEL ?? "gemini-2.0-flash-lite";
    case "deepseek":
      return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    case "opencode":
      return process.env.OPENCODE_MODEL ?? "claude-sonnet-4-5";
  }
}

// Build a provider, preferring a user-stored API key (DB) over the env var.
// Keys configured via the settings page win; env vars are the fallback so the
// app keeps working for users who never touch that UI.
function build(userId: string, name: ProviderName): Provider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(
        new Anthropic({ apiKey: resolveApiKey(userId, "anthropic") }),
        defaultModel("anthropic"),
      );
    case "openai":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: resolveApiKey(userId, "openai") }),
        defaultModel("openai"),
        "openai",
      );
    case "gemini":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: process.env.GEMINI_API_KEY!, baseURL: GEMINI_BASE_URL }),
        defaultModel("gemini"),
        "gemini",
      );
    case "deepseek":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: resolveApiKey(userId, "deepseek"), baseURL: DEEPSEEK_BASE_URL }),
        defaultModel("deepseek"),
        "deepseek",
      );
    case "opencode":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: resolveApiKey(userId, "opencode"), baseURL: OPENCODE_BASE_URL }),
        defaultModel("opencode"),
        "opencode",
      );
  }
}

// Per-user, per-provider cache so each user's BYOK keys resolve to their own
// SDK client.
const cache = new Map<string, Provider>();

function cacheKey(userId: string, name: ProviderName): string {
  return `${userId}:${name}`;
}

// Drop cached SDK clients. Pass a userId to clear just that user's providers;
// omit it to clear the whole table (used after api-keys PUT/DELETE and in
// tests). Call this after api-keys mutations so the next build() rebuilds
// providers with the now-current key instead of reusing a client frozen on
// the old (env) key.
export function resetProviderCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const name of PROVIDER_NAMES) cache.delete(cacheKey(userId, name));
}

export function getProvider(userId: string, name?: string): Provider {
  const fallback = hasOpenCodeKey(userId) ? "opencode" : "anthropic";
  const resolved = (name ?? process.env.LLM_PROVIDER ?? fallback) as ProviderName;
  if (!PROVIDER_NAMES.includes(resolved)) {
    throw new Error(
      `Unknown LLM provider "${resolved}". Expected one of: ${PROVIDER_NAMES.join(", ")}`,
    );
  }
  const key = cacheKey(userId, resolved);
  let provider = cache.get(key);
  if (!provider) {
    provider = build(userId, resolved);
    cache.set(key, provider);
  }
  return provider;
}

// Whether OpenCode is usable: a key is present either in the DB or the env.
// Replaces the bare process.env.OPENCODE_API_KEY checks in flow routing so the
// OpenCode path activates once the user enters an OpenCode key via settings.
function hasOpenCodeKey(userId: string): boolean {
  return resolveApiKey(userId, "opencode") != null;
}

// Build an OpenCode provider with a specific model. Used by getTailorProvider
// and getStructureProvider to route different models through the same proxy.
function buildOpenCodeProvider(userId: string, model: string): Provider {
  return new OpenAICompatibleProvider(
    new OpenAI({ apiKey: resolveApiKey(userId, "opencode"), baseURL: OPENCODE_BASE_URL }),
    model,
    "opencode",
  );
}

// True when the tailor flow will run against a USER-supplied (BYOK) key rather
// than a server-side env key. Mirrors getProviderForFlow(userId, "tailor")
// routing exactly so rate-limiting only grants "unlimited" to users whose
// tailor calls actually spend their own tokens (not the app's). A user who
// BYOK'd a provider the flow doesn't use (e.g. anthropic while the server runs
// OpenCode) is correctly reported as subsidized - that's the real cost path.
export function tailorUsesByokKey(userId: string): boolean {
  if (hasOpenCodeKey(userId)) {
    // OpenCode path: BYOK iff a DB-stored opencode key exists (env-only = subsidized).
    return getApiKey(userId, "opencode") != null;
  }
  // Anthropic fallback path: BYOK iff a DB-stored anthropic key exists.
  return getApiKey(userId, "anthropic") != null;
}

// Per-flow model routing. Each flow can be pinned with its own LLM_PROVIDER_<FLOW>
// env var; unset flows fall back to the global LLM_PROVIDER.
export type Flow = "edit" | "import" | "parse-prose" | "tailor";

const FLOW_ENV: Record<Flow, string> = {
  tailor: "LLM_PROVIDER_TAILOR",
  edit: "LLM_PROVIDER_EDIT",
  import: "LLM_PROVIDER_IMPORT",
  "parse-prose": "LLM_PROVIDER_PARSE_PROSE",
};

export function getProviderForFlow(userId: string, flow: Flow): Provider {
  const override = process.env[FLOW_ENV[flow]];
  if (override) return getProvider(userId, override);

  // When OpenCode is configured, route all quality-sensitive flows through it.
  // Tailor: Sonnet via OpenCode for bullet rewording.
  // Edit/import/parse-prose: also Sonnet for quality.
  if (hasOpenCodeKey(userId)) {
    if (flow === "tailor" || flow === "edit") return getTailorProvider(userId);
    // Lighter flows can use a cheaper model if desired; for now, same.
    return getTailorProvider(userId);
  }

  // Fallback: Anthropic for quality flows, whatever LLM_PROVIDER is for others.
  if (flow === "tailor" || flow === "edit") return getProvider(userId, "anthropic");
  return getProvider(userId);
}

// getTailorProvider returns an OpenCode provider configured with the tailor model
// (Sonnet via OpenCode). Used for the main tailoring/editing pipeline.
export function getTailorProvider(userId: string): Provider {
  // TEMP: OpenCode Zen's Claude upstream is returning 500s (verified
  // 2026-08-24: claude-sonnet-4-5/haiku 500, gemini 500, deepseek 200 OK).
  // Default to deepseek-v4-flash until OpenCode restores the Claude upstream.
  // Remove this override (restore "claude-sonnet-4-5") once fixed.
  const model = process.env.OPENCODE_TAILOR_MODEL ?? "deepseek-v4-flash";
  return buildOpenCodeProvider(userId, model);
}

// getStructureProvider returns the provider used for the two-phase tailor's
// structure-selection step. Uses DeepSeek v4 flash via OpenCode when configured;
// falls back to DeepSeek direct, then Anthropic.
export function getStructureProvider(userId: string): Provider {
  if (hasOpenCodeKey(userId)) {
    const model = process.env.OPENCODE_STRUCTURE_MODEL ?? "deepseek-v4-flash";
    return buildOpenCodeProvider(userId, model);
  }
  if (resolveApiKey(userId, "deepseek") != null) return getProvider(userId, "deepseek");
  return getProvider(userId, "anthropic");
}