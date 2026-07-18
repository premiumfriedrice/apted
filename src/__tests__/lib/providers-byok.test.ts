// Tests that the provider factory (PRE-84) wires DB-stored keys through
// resolveApiKey() into the SDK clients, with env vars as the fallback. We mock
// the SDK constructors to capture the `apiKey` option they receive and the
// api-keys module so resolveApiKey is deterministic.
//
// The factory caches built providers in a module-level Map, so each test
// resets modules and re-imports to get a fresh cache.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the apiKey option handed to each SDK constructor.
const anthropicCtor = vi.hoisted(() => vi.fn());
const openaiCtor = vi.hoisted(() => vi.fn());
const resolveApiKey = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  // Must be newable with `new`, so use a regular function, not an arrow.
  function MockAnthropic(this: unknown, opts?: { apiKey?: string }) {
    anthropicCtor(opts?.apiKey);
    return { _stub: "anthropic", messages: { create: vi.fn() } };
  }
  return { default: MockAnthropic };
});

vi.mock("openai", () => {
  function MockOpenAI(this: unknown, opts?: { apiKey?: string; baseURL?: string }) {
    openaiCtor(opts?.apiKey, opts?.baseURL);
    return { _stub: "openai", chat: { completions: { create: vi.fn() } } };
  }
  return { default: MockOpenAI };
});

vi.mock("@/lib/api-keys", () => ({ resolveApiKey }));

import type * as ProvidersMod from "@/lib/providers/index";

let factory: typeof ProvidersMod;

beforeEach(async () => {
  vi.clearAllMocks();
  resolveApiKey.mockImplementation(() => undefined);
  vi.resetModules();
  factory = await import("@/lib/providers/index");
});

const UID = "test-user";

describe("provider factory uses DB-resolved keys", () => {
  it("hands the resolved Anthropic key to the Anthropic SDK", () => {
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "anthropic" ? "db-anthropic" : undefined));
    factory.getProvider(UID, "anthropic");
    expect(anthropicCtor).toHaveBeenCalledWith("db-anthropic");
  });

  it("falls back to undefined (env path) when DB key is absent", () => {
    factory.getProvider(UID, "anthropic");
    expect(anthropicCtor).toHaveBeenCalledWith(undefined);
  });

  it("hands the resolved OpenAI key to the OpenAI SDK", () => {
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "openai" ? "db-openai" : undefined));
    factory.getProvider(UID, "openai");
    expect(openaiCtor).toHaveBeenCalledWith("db-openai", undefined);
  });

  it("hands the resolved DeepSeek key with its base URL", () => {
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "deepseek" ? "db-ds" : undefined));
    factory.getProvider(UID, "deepseek");
    expect(openaiCtor).toHaveBeenCalledWith("db-ds", "https://api.deepseek.com/v1");
  });

  it("opencode provider and tailor both use the resolved opencode key", () => {
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "opencode" ? "db-oc" : undefined));
    factory.getProvider(UID, "opencode");
    factory.getTailorProvider(UID);
    // Two OpenAI clients are built (one per build call) — both with db-oc.
    expect(openaiCtor).toHaveBeenCalledWith("db-oc", "https://opencode.ai/zen/v1");
    expect(openaiCtor).toHaveBeenLastCalledWith("db-oc", "https://opencode.ai/zen/v1");
  });

  it("getStructureProvider prefers DeepSeek direct when OpenCode key is absent", () => {
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "deepseek" ? "db-ds" : undefined));
    factory.getStructureProvider(UID);
    expect(openaiCtor).toHaveBeenCalledWith("db-ds", "https://api.deepseek.com/v1");
  });

  it("getProviderForFlow routes to OpenCode when an opencode key is present", () => {
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "opencode" ? "db-oc" : undefined));
    factory.getProviderForFlow(UID, "tailor");
    expect(openaiCtor).toHaveBeenCalledWith("db-oc", "https://opencode.ai/zen/v1");
  });

  it("resetProviderCache() rebuilds with the newly-saved key instead of the stale cached one", () => {
    // First call: no DB key -> provider builds on the env/default (undefined).
    resolveApiKey.mockImplementation(() => undefined);
    factory.getProvider(UID, "anthropic");
    expect(anthropicCtor).toHaveBeenLastCalledWith(undefined);

    // User saves an Anthropic key via Settings: resolveApiKey now returns it.
    resolveApiKey.mockImplementation((_u: string, p: string) => (p === "anthropic" ? "db-anthropic" : undefined));
    // Without a reset, the cached provider would be reused and no new client built.
    factory.resetProviderCache();
    factory.getProvider(UID, "anthropic");
    expect(anthropicCtor).toHaveBeenLastCalledWith("db-anthropic");
    // Exactly two SDK constructions happened across the test.
    expect(anthropicCtor).toHaveBeenCalledTimes(2);
  });
});