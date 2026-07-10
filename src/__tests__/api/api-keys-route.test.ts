// Tests for /api/settings/api-keys endpoints (PRE-84).
//
// Covers:
//   - GET returns the boolean key status, never key values
//   - PUT persists a key (delegates to setApiKey) and validates the provider
//   - DELETE clears a key (delegates to clearApiKey)
//   - Bad provider / missing key → 400
import { describe, it, expect, vi, beforeEach } from "vitest";

const stubs = vi.hoisted(() => ({
  getKeyStatus: vi.fn(),
  setApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  resetProviderCache: vi.fn(),
}));

vi.mock("@/lib/api-keys", () => ({
  getKeyStatus: stubs.getKeyStatus,
  setApiKey: stubs.setApiKey,
  clearApiKey: stubs.clearApiKey,
  isKeyedProvider: (p: string) =>
    p === "opencode" || p === "anthropic" || p === "openai" || p === "deepseek",
}));

vi.mock("@/lib/providers/index", () => ({
  resetProviderCache: stubs.resetProviderCache,
}));

import { GET, PUT, DELETE } from "@/app/api/settings/api-keys/route";

beforeEach(() => {
  vi.clearAllMocks();
  stubs.getKeyStatus.mockReturnValue({
    opencode: false,
    anthropic: false,
    openai: false,
    deepseek: false,
  });
});

const okStatus = {
  opencode: true,
  anthropic: false,
  openai: false,
  deepseek: false,
};

describe("GET /api/settings/api-keys", () => {
  it("returns boolean key status with no values", async () => {
    stubs.getKeyStatus.mockReturnValue(okStatus);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(okStatus);
    // The wire payload must never contain a key string.
    expect(JSON.stringify(body)).not.toMatch(/[A-Za-z0-9_-]{20,}/);
  });
});

describe("PUT /api/settings/api-keys", () => {
  it("saves a key and returns the new status", async () => {
    stubs.setApiKey.mockResolvedValueOnce(undefined);
    stubs.getKeyStatus.mockReturnValueOnce(okStatus);
    const req = new Request("http://localhost/api/settings/api-keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "opencode", key: "sk-test-key-value" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(stubs.setApiKey).toHaveBeenCalledWith("opencode", "sk-test-key-value");
    expect(stubs.resetProviderCache).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(okStatus);
  });

  it("rejects an unknown provider", async () => {
    const req = new Request("http://localhost/api/settings/api-keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "gemini", key: "k" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(stubs.setApiKey).not.toHaveBeenCalled();
    expect(stubs.resetProviderCache).not.toHaveBeenCalled();
  });

  it("rejects a non-string key", async () => {
    const req = new Request("http://localhost/api/settings/api-keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "opencode", key: 123 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const req = new Request("http://localhost/api/settings/api-keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/settings/api-keys", () => {
  it("clears a key by provider query param", async () => {
    stubs.clearApiKey.mockResolvedValueOnce(undefined);
    stubs.getKeyStatus.mockReturnValueOnce({
      opencode: false,
      anthropic: false,
      openai: false,
      deepseek: false,
    });
    const req = new Request(
      "http://localhost/api/settings/api-keys?provider=opencode",
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(stubs.clearApiKey).toHaveBeenCalledWith("opencode");
    expect(stubs.resetProviderCache).toHaveBeenCalledTimes(1);
  });

  it("rejects deleting an unknown provider", async () => {
    const req = new Request("http://localhost/api/settings/api-keys?provider=bogus", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    expect(stubs.clearApiKey).not.toHaveBeenCalled();
  });

  it("rejects deleting with a missing provider param", async () => {
    const req = new Request("http://localhost/api/settings/api-keys", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});