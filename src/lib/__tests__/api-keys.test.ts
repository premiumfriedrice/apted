// Tests for the bring-your-own api key storage (PRE-84).
//
// Covers:
//   - loadApiKeys() maps DB columns to providers (null when blank/missing)
//   - resolveApiKey() prefers the DB key over the env var, and falls back to env
//   - setApiKey() writes the column and refreshes the cache
//   - clearApiKey() nulls the column
//   - getKeyStatus() exposes only booleans — never the key values
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { query: mockQuery },
}));

import {
  loadApiKeys,
  resolveApiKey,
  setApiKey,
  clearApiKey,
  getKeyStatus,
  getApiKey,
  isKeyedProvider,
} from "../api-keys";

beforeEach(() => {
  vi.clearAllMocks();
  // Restore env vars between tests.
  for (const k of [
    "OPENCODE_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
  ]) {
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of [
    "OPENCODE_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
  ]) {
    delete process.env[k];
  }
});

describe("loadApiKeys", () => {
  it("maps DB columns to providers", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          opencode_key: "oc-123",
          anthropic_key: null,
          openai_key: "",
          deepseek_key: "ds-456",
        },
      ],
    });
    const m = await loadApiKeys();
    expect(m.opencode).toBe("oc-123");
    expect(m.anthropic).toBeNull();
    // Empty string is treated as unset so env fallback still applies.
    expect(m.openai).toBeNull();
    expect(m.deepseek).toBe("ds-456");
  });

  it("returns all-null when row is absent", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const m = await loadApiKeys();
    expect(m).toEqual({ opencode: null, anthropic: null, openai: null, deepseek: null });
  });

  it("returns all-null when the table is missing", async () => {
    mockQuery.mockRejectedValueOnce(new Error("relation api_keys does not exist"));
    const m = await loadApiKeys();
    expect(m.opencode).toBeNull();
    expect(m.deepseek).toBeNull();
  });
});

describe("resolveApiKey precedence", () => {
  it("prefers the DB-stored key over the env var", async () => {
    process.env.ANTHROPIC_API_KEY = "env-fallback";
    mockQuery.mockResolvedValueOnce({
      rows: [{ anthropic_key: "db-key", opencode_key: null, openai_key: null, deepseek_key: null }],
    });
    await loadApiKeys();
    expect(resolveApiKey("anthropic")).toBe("db-key");
  });

  it("falls back to the env var when the DB key is unset", async () => {
    process.env.ANTHROPIC_API_KEY = "env-fallback";
    mockQuery.mockResolvedValueOnce({ rows: [{ anthropic_key: null }] });
    await loadApiKeys();
    expect(resolveApiKey("anthropic")).toBe("env-fallback");
  });

  it("returns undefined when neither DB nor env has a key", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ anthropic_key: null }] });
    await loadApiKeys();
    expect(resolveApiKey("anthropic")).toBeUndefined();
  });
});

describe("setApiKey / clearApiKey", () => {
  it("writes the provider column on upsert and trims whitespace", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ opencode_key: "  oc-1  " }] }); // refresh load
    await setApiKey("opencode", "  oc-1  ");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO api_keys");
    expect(sql).toContain("opencode_key");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE SET opencode_key");
    expect(params).toEqual(["oc-1"]);
  });

  it("treating an empty/whitespace key as a clear (NULL)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ opencode_key: null }] });
    await setApiKey("opencode", "   ");
    expect(mockQuery.mock.calls[0][1]).toEqual([null]);
  });

  it("clearApiKey nulls the column", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ opencode_key: null }] });
    await clearApiKey("opencode");
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("UPDATE api_keys SET opencode_key = NULL");
  });
});

describe("getKeyStatus never leaks values", () => {
  it("returns booleans only", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ opencode_key: "secret-oc", anthropic_key: null, openai_key: "x", deepseek_key: "y" }],
    });
    await loadApiKeys();
    const status = getKeyStatus();
    expect(status).toEqual({
      opencode: true,
      anthropic: false,
      openai: true,
      deepseek: true,
    });
    const json = JSON.stringify(status);
    expect(json).not.toContain("secret-oc");
    expect(json).not.toContain("x");
    expect(json).not.toContain("y");
  });

  it("getApiKey returns the raw value (server-side only)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ opencode_key: "secret-oc", anthropic_key: null, openai_key: null, deepseek_key: null }],
    });
    await loadApiKeys();
    expect(getApiKey("opencode")).toBe("secret-oc");
  });
});

describe("isKeyedProvider", () => {
  it("accepts the four BYOK providers and rejects others", () => {
    expect(isKeyedProvider("opencode")).toBe(true);
    expect(isKeyedProvider("anthropic")).toBe(true);
    expect(isKeyedProvider("openai")).toBe(true);
    expect(isKeyedProvider("deepseek")).toBe(true);
    expect(isKeyedProvider("gemini")).toBe(false);
    expect(isKeyedProvider("bogus")).toBe(false);
  });
});