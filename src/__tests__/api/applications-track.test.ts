import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockComplete } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockComplete: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { query: mockQuery },
  setRlsUserOnPool: vi.fn(async () => {}),
}));

vi.mock("@/lib/providers", () => ({
  getProviderForFlow: () => ({ complete: mockComplete }),
}));

vi.mock("@/lib/api-keys", () => ({
  ensureApiKeysLoaded: vi.fn(async () => {}),
}));

import { POST } from "@/app/api/applications/track/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/applications/track", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function llmResult(json: unknown) {
  mockComplete.mockResolvedValueOnce(JSON.stringify(json));
}

describe("POST /api/applications/track", () => {
  it("400s on empty text", async () => {
    const res = await POST(req({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("applies an update op to the matched company", async () => {
    // 1) tracked-context select, 2) company match, 3) UPDATE
    mockQuery.mockResolvedValueOnce({
      rows: [{ company: "Stripe", role: "Senior Engineer", outcome: "interviewing", interview_round: 2, rejected_after_round: null }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "a1" }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    llmResult({
      reply: "Updated Stripe to rejected after round 2.",
      ops: [{ action: "update", company: "Stripe", outcome: "rejected", rejectedAfterRound: 2 }],
    });

    const res = await POST(req({ text: "stripe rejected me after round 2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toContain("Stripe");
    expect(body.summary).toEqual(["updated Stripe → rejected"]);

    const updateSql = mockQuery.mock.calls[2][0] as string;
    expect(updateSql).toMatch(/UPDATE applications/);
    expect(updateSql).toMatch(/rejected_after_round/);
  });

  it("creates a new application from a create op", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // tracked-context select
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "new" }] }); // INSERT
    llmResult({
      reply: "Logged Linear as applied.",
      ops: [{ action: "create", company: "Linear", role: "Senior Engineer", outcome: "applied" }],
    });

    const res = await POST(req({ text: "just applied to Linear", currentRole: "Senior Engineer" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual(["logged Linear (applied)"]);

    const insertSql = mockQuery.mock.calls[1][0] as string;
    const insertVals = mockQuery.mock.calls[1][1] as unknown[];
    expect(insertSql).toMatch(/INSERT INTO applications/);
    expect(insertVals).toContain("Linear");
    expect(insertVals).toContain("Senior Engineer");
  });

  it("reports when no application matches an update op", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // tracked-context select
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no match
    llmResult({
      reply: "No application found for Acme.",
      ops: [{ action: "update", company: "Acme", outcome: "rejected" }],
    });

    const res = await POST(req({ text: "acme rejected me" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual(["no application found for Acme"]);
  });

  it("502s when the model output is unparseable", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockComplete.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(req({ text: "whatever" }));
    expect(res.status).toBe(502);
  });

  it("rejects an op with an unknown outcome value", async () => {
    // Unknown outcome → zod is not involved (outcome is plain string); the
    // route's isOutcome guard makes oc undefined, so an update with only a
    // bogus outcome produces "nothing to update".
    mockQuery.mockResolvedValueOnce({ rows: [] }); // tracked-context
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "a1" }] }); // match
    llmResult({
      reply: "…",
      ops: [{ action: "update", company: "Stripe", outcome: "hired-forever" }],
    });

    const res = await POST(req({ text: "stripe hired me forever" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual(["nothing to update for Stripe"]);
  });
});
