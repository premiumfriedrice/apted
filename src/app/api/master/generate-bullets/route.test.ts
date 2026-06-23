import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCallAndParse } = vi.hoisted(() => ({
  mockCallAndParse: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callAndParse: mockCallAndParse,
}));

const { mockGetProviderForFlow } = vi.hoisted(() => ({
  mockGetProviderForFlow: vi.fn(() => ({ name: "mock", model: "mock-model" })),
}));

vi.mock("@/lib/providers", () => ({
  getProviderForFlow: mockGetProviderForFlow,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/master/generate-bullets", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/master/generate-bullets", () => {
  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://localhost/api/master/generate-bullets", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty prose", async () => {
    const res = await POST(makeRequest({ itemId: "exp-1", prose: "   ", existingBullets: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("prose is required");
  });

  it("returns merged bullets from prose + existing", async () => {
    const merged = [
      { id: "b0", text: "Kept existing bullet." },
      { id: "b-new", text: "Built a notification system handling 10k events/sec." },
    ];
    mockCallAndParse.mockResolvedValue({ bullets: merged });
    const existing = [{ id: "b0", text: "Kept existing bullet." }];

    const res = await POST(makeRequest({ itemId: "exp-1", prose: "Built a notification system handling 10k events/sec.", existingBullets: existing }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bullets).toEqual(merged);
    expect(body.notes).toBe("Built a notification system handling 10k events/sec.");
  });

  it("preserves existing accurate bullets", async () => {
    const existing = [{ id: "b0", text: "Led a team of 5 engineers." }];
    mockCallAndParse.mockResolvedValue({ bullets: existing });

    const res = await POST(makeRequest({ itemId: "exp-1", prose: "Led a team of 5 engineers.", existingBullets: existing }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bullets).toEqual(existing);
  });

  it("adds new bullets for prose detail not covered", async () => {
    const existing = [{ id: "b0", text: "Led a team of 5 engineers." }];
    const merged = [
      ...existing,
      { id: "b-new", text: "Reduced latency from 5s to 300ms." },
    ];
    mockCallAndParse.mockResolvedValue({ bullets: merged });

    const res = await POST(makeRequest({
      itemId: "exp-1",
      prose: "Led a team of 5 engineers and reduced latency from 5s to 300ms.",
      existingBullets: existing,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bullets).toHaveLength(2);
    expect(body.bullets[1]).toEqual({ id: "b-new", text: "Reduced latency from 5s to 300ms." });
  });

  it("falls back to existing bullets on LLM failure", async () => {
    mockCallAndParse.mockRejectedValue(new Error("LLM provider error"));
    const existing = [{ id: "b0", text: "Existing bullet." }];

    const res = await POST(makeRequest({ itemId: "exp-1", prose: "Some prose.", existingBullets: existing }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bullets).toEqual(existing);
    expect(body.notes).toBe("Some prose.");
  });

  it("saves prose as notes field", async () => {
    mockCallAndParse.mockResolvedValue({ bullets: [] });

    const res = await POST(makeRequest({ itemId: "exp-1", prose: "Raw detail dump.", existingBullets: [] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("Raw detail dump.");
  });
});
