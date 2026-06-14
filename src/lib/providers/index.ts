// Provider factory. Resolves which model backend to use from env and caches one
// instance per provider. Generators in llm.ts call getProvider() (honoring
// LLM_PROVIDER); the benchmark passes an explicit name to compare all three.
//
// Never import this from a client component — it constructs API clients holding
// server-only keys.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai";
import type { Provider } from "./types";

export type ProviderName = "anthropic" | "openai" | "gemini" | "deepseek" | "opencode";
export type { Provider } from "./types";

export const PROVIDER_NAMES: ProviderName[] = ["anthropic", "openai", "gemini", "deepseek", "opencode"];

// Google exposes an OpenAI-compatible surface here, so the OpenAI adapter works
// verbatim against Gemini.
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

// DeepSeek is OpenAI-compatible — same adapter as Gemini.
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

// OpenCode is a local proxy that routes to different providers based on the
// model prefix (e.g. "anthropic/claude-sonnet-4-5", "deepseek/deepseek-v4-flash").
// It exposes an OpenAI-compatible API at localhost:4096.
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://localhost:4096/v1";
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? "opencode";

// Per-provider model defaults. Override any of them with the matching *_MODEL
// env var without touching code.
function defaultModel(name: ProviderName): string {
  switch (name) {
    case "anthropic":
      return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
    case "openai":
      return process.env.OPENAI_MODEL ?? "gpt-4.1-nano";
    case "gemini":
      return process.env.GEMINI_MODEL ?? "gemini-2.0-flash-lite";
    case "deepseek":
      return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    case "opencode":
      return process.env.OPENCODE_MODEL ?? "anthropic/claude-sonnet-4-5";
  }
}

function build(name: ProviderName): Provider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(
        new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
        defaultModel("anthropic"),
      );
    case "openai":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
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
        new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: DEEPSEEK_BASE_URL }),
        defaultModel("deepseek"),
        "deepseek",
      );
    case "opencode":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: OPENCODE_API_KEY, baseURL: OPENCODE_BASE_URL }),
        defaultModel("opencode"),
        "opencode",
      );
  }
}

const cache = new Map<ProviderName, Provider>();

export function getProvider(name?: string): Provider {
  const resolved = (name ?? process.env.LLM_PROVIDER ?? "anthropic") as ProviderName;
  if (!PROVIDER_NAMES.includes(resolved)) {
    throw new Error(
      `Unknown LLM provider "${resolved}". Expected one of: ${PROVIDER_NAMES.join(", ")}`,
    );
  }
  let provider = cache.get(resolved);
  if (!provider) {
    provider = build(resolved);
    cache.set(resolved, provider);
  }
  return provider;
}

// Build an OpenCode provider with a specific model. Used by getTailorProvider
// and getStructureProvider to route different models through the same proxy.
function buildOpenCodeProvider(model: string): Provider {
  return new OpenAICompatibleProvider(
    new OpenAI({ apiKey: OPENCODE_API_KEY, baseURL: OPENCODE_BASE_URL }),
    model,
    "opencode",
  );
}

// Per-flow model routing. Each flow can be pinned with its own LLM_PROVIDER_<FLOW>
// env var; unset flows fall back to the global LLM_PROVIDER (then anthropic).
export type Flow = "edit" | "import" | "parse-prose" | "tailor";

const FLOW_ENV: Record<Flow, string> = {
  tailor: "LLM_PROVIDER_TAILOR",
  edit: "LLM_PROVIDER_EDIT",
  import: "LLM_PROVIDER_IMPORT",
  "parse-prose": "LLM_PROVIDER_PARSE_PROSE",
};

export function getProviderForFlow(flow: Flow): Provider {
  const override = process.env[FLOW_ENV[flow]];
  if (override) return getProvider(override);

  // Default routing: tailor uses OpenCode (Opus/Sonnet) if configured.
  if (flow === "tailor") {
    if (process.env.OPENCODE_API_KEY || process.env.LLM_PROVIDER === "opencode") {
      return getTailorProvider();
    }
    return getProvider("anthropic");
  }
  return getProvider();
}

// getTailorProvider returns an OpenCode provider configured with the tailor model
// (Opus or Sonnet via OpenCode). Used for the main tailoring/editing pipeline
// where quality matters most.
export function getTailorProvider(): Provider {
  const model = process.env.OPENCODE_TAILOR_MODEL ?? "anthropic/claude-sonnet-4-5";
  return buildOpenCodeProvider(model);
}

// getStructureProvider returns the provider used for the two-phase tailor's
// structure-selection step (cheap model that filters the master resume before
// the main model does the heavy lifting). Prefers OpenCode with DeepSeek when
// OPENCODE_API_KEY is configured; falls back to DeepSeek direct, then Anthropic.
export function getStructureProvider(): Provider {
  // Prefer OpenCode with DeepSeek when configured.
  if (process.env.OPENCODE_API_KEY || process.env.LLM_PROVIDER === "opencode") {
    const model = process.env.OPENCODE_STRUCTURE_MODEL ?? "deepseek/deepseek-v4-flash";
    return buildOpenCodeProvider(model);
  }
  if (process.env.DEEPSEEK_API_KEY) return getProvider("deepseek");
  return getProvider("anthropic");
}