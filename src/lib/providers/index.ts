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

export type ProviderName = "anthropic" | "openai" | "gemini";
export type { Provider } from "./types";

export const PROVIDER_NAMES: ProviderName[] = ["anthropic", "openai", "gemini"];

// Google exposes an OpenAI-compatible surface here, so the OpenAI adapter works
// verbatim against Gemini.
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

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
  }
}

function build(name: ProviderName): Provider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(
        new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
        defaultModel("anthropic"),
      );
    case "openai":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        defaultModel("openai"),
        "openai",
      );
    case "gemini":
      return new OpenAICompatibleProvider(
        new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL: GEMINI_BASE_URL }),
        defaultModel("gemini"),
        "gemini",
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

// Per-flow model routing. Tailoring is quality-sensitive; the simpler flows
// (edit/import/parse-prose) are schema-bounded and can run on a cheaper model.
// Each flow can be pinned with its own LLM_PROVIDER_<FLOW> env var; unset flows
// fall back to the global LLM_PROVIDER (then anthropic). This lets you run e.g.
// tailor on Claude and the rest on Gemini without code changes.
export type Flow = "tailor" | "edit" | "import" | "parse-prose";

const FLOW_ENV: Record<Flow, string> = {
  tailor: "LLM_PROVIDER_TAILOR",
  edit: "LLM_PROVIDER_EDIT",
  import: "LLM_PROVIDER_IMPORT",
  "parse-prose": "LLM_PROVIDER_PARSE_PROSE",
};

export function getProviderForFlow(flow: Flow): Provider {
  return getProvider(process.env[FLOW_ENV[flow]] || undefined);
}
