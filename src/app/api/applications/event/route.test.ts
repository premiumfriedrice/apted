import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: {
    query: mockQuery,
  },
  setRlsUserOnPool: vi.fn(async () => {}),
}));

import { POST } from "./route";

beforeEach(() => {
  // mockReset (not mockClear) — leftover once-implementations from a prior
  // test would otherwise leak into the next one's calls.
  vi.resetAllMocks();
});

const fakeRow = {
  id: "a1",
  version_id: null,
  company: "Unknown Company",
  role: "Unknown Role",
  job_description: "",
  outcome: "applied",
  interview_round: null,
  rejected_after_round: null,
  portal_url: "https://jobs.lever.co/acme/abc",
  notes: "Logged automatically by the apted Tracker extension.",
  created_at: "2026-10-21T00:00:00Z",
};

function appJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    versionId: row.version_id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    outcome: row.outcome,
    interviewRound: row.interview_round,
    rejectedAfterRound: row.rejected_after_round,
    portalUrl: row.portal_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/applications/event", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/applications/event", () => {
  it("inserts a partial capture with fallback names and outcome applied", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // dedupe select
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] }); // insert

    const res = await POST(
      req({
        trackedObj: "lever:acme/abc",
        url: "https://jobs.lever.co/acme/abc",
        capturedAt: "2026-10-21T12:00:00Z",
        partial: { source: "lever" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(appJson(fakeRow));

    const [sql, params] = mockQuery.mock.calls[1]!;
    expect(sql).toContain("INSERT INTO applications");
    expect(params).toContain("lever:acme/abc");
    expect(params).toContain("Unknown Company");
    expect(params).toContain("Unknown Role");
    expect(params).toContain("applied");
    expect(params).toContain("Logged automatically by the apted Tracker extension.");
  });

  it("uses partial company/role when provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...fakeRow,
          company: "Stripe",
          role: "Engineer",
          job_description: "jd text",
        },
      ],
    });

    const res = await POST(
      req({
        trackedObj: "greenhouse:stripe/1",
        url: "https://boards.greenhouse.io/stripe/jobs/1",
        partial: { company: "Stripe", role: "Engineer", jobDescription: "jd text" },
      }),
    );
    expect(res.status).toBe(200);
    const [, params] = mockQuery.mock.calls[1]!;
    expect(params).toContain("Stripe");
    expect(params).toContain("Engineer");
  });

  it("is idempotent per trackedObj — returns the existing row without inserting", async () => {
    const existing = { ...fakeRow, id: "a-existing" };
    mockQuery.mockResolvedValueOnce({ rows: [existing] }); // dedupe select hits

    const res = await POST(
      req({
        trackedObj: "greenhouse:stripe/1",
        url: "https://boards.greenhouse.io/stripe/jobs/1",
        partial: { company: "Stripe" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(appJson(existing));
    expect(mockQuery).toHaveBeenCalledTimes(1); // no INSERT
    const [sql] = mockQuery.mock.calls[0]!;
    expect(sql).toContain("tracked_obj = $2");
  });

  it("handles a missing body gracefully (bare event still lands)", async () => {
    // No trackedObj → no dedupe select; a single INSERT call.
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

    const res = await POST(
      new Request("http://localhost/api/applications/event", {
        method: "POST",
        body: "{not json",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(appJson(fakeRow));
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("defaults interviewing events to round 1 (DB check constraint)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeRow, outcome: "interviewing", interview_round: 1 }],
    });

    await POST(
      req({
        trackedObj: "ashbyhq:acme/xyz",
        partial: { company: "Acme", role: "Engineer", outcome: "interviewing" },
      }),
    );
    const [sql, params] = mockQuery.mock.calls[1]!;
    expect(sql).toContain("INSERT INTO applications");
    expect(params).toContain("interviewing");
    expect(params).toContain(1);
  });

  it("recovers from a unique-violation race by returning the winning row", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // first dedupe select: miss
    mockQuery.mockRejectedValueOnce(new Error("duplicate key")); // race
    mockQuery.mockResolvedValueOnce({ rows: [{ ...fakeRow, id: "a-winner" }] }); // re-select

    const res = await POST(req({ trackedObj: "lever:acme/abc" }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("a-winner");
  });
});
