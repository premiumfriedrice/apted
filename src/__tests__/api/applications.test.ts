import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: {
    query: mockQuery,
  },
}));

import { GET, POST } from "@/app/api/versions/[id]/applications/route";
import { GET as GetApp, PATCH, DELETE } from "@/app/api/applications/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

const fakeApplication = {
  id: "a1",
  version_id: "v1",
  company: "Acme",
  role: "Engineer",
  job_description: "Build things",
  outcome: "draft",
  portal_url: null,
  notes: null,
  created_at: "2024-01-01T00:00:00Z",
};

function appJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    versionId: row.version_id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    outcome: row.outcome,
    portalUrl: row.portal_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

describe("GET /api/versions/[id]/applications", () => {
  it("lists applications for a version", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeApplication] });

    const req = new Request("http://localhost/api/versions/v1/applications");
    const res = await GET(req, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual([appJson(fakeApplication)]);
  });
});

describe("POST /api/versions/[id]/applications", () => {
  it("creates a new application", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeApplication] });

    const req = new Request("http://localhost/api/versions/v1/applications", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme",
        role: "Engineer",
        jobDescription: "Build things",
        outcome: "applied",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual(appJson(fakeApplication));

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO applications");
    expect(params).toContain("v1");
    expect(params).toContain("Acme");
    expect(params).toContain("applied");
  });

  it("returns 400 when company or role is missing", async () => {
    const req = new Request("http://localhost/api/versions/v1/applications", {
      method: "POST",
      body: JSON.stringify({ company: "Acme" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(400);
  });

  it("persists portalUrl when provided", async () => {
    const row = { ...fakeApplication, portal_url: "https://careers.acme.com/123" };
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const req = new Request("http://localhost/api/versions/v1/applications", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme",
        role: "Engineer",
        jobDescription: "Build things",
        outcome: "applied",
        portalUrl: "https://careers.acme.com/123",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(200);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("portal_url");
    expect(params).toContain("https://careers.acme.com/123");
  });
});

describe("GET /api/applications/[id]", () => {
  it("returns a single application", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeApplication] });

    const req = new Request("http://localhost/api/applications/a1");
    const res = await GetApp(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual(appJson(fakeApplication));
  });

  it("returns 404 when application does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = new Request("http://localhost/api/applications/nope");
    const res = await GetApp(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/applications/[id]", () => {
  it("updates outcome", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeApplication, outcome: "interviewing", interview_round: 1 }],
    });

    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({ outcome: "interviewing", interviewRound: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.outcome).toBe("interviewing");
  });

  it("auto-sets interview_round=1 when changing outcome to interviewing", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeApplication, outcome: "interviewing", interview_round: 1 }],
    });

    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({ outcome: "interviewing" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    // Inspect the SQL passed to the mock for the auto-set field.
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("interview_round");
    const vals = mockQuery.mock.calls[0][1] as unknown[];
    expect(vals).toContain(1);
  });

  it("auto-sets rejected_after_round=0 when changing outcome to rejected", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeApplication, outcome: "rejected", rejected_after_round: 0 }],
    });
    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({ outcome: "rejected" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const vals = mockQuery.mock.calls[0][1] as unknown[];
    expect(vals).toContain(0);
  });

  it("clears interview_round and rejected_after_round for terminal outcomes", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeApplication, outcome: "offer" }],
    });
    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({ outcome: "offer" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("interview_round");
    expect(sql).toContain("rejected_after_round");
    const vals = mockQuery.mock.calls[0][1] as unknown[];
    expect(vals).toContain(null);
  });

  it("returns 400 when no fields provided", async () => {
    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
  });

  it("updates portalUrl and notes", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeApplication, portal_url: "https://careers.acme.com/123", notes: "recruiter: Jane" }],
    });
    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({
        portalUrl: "https://careers.acme.com/123",
        notes: "recruiter: Jane",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.portalUrl).toBe("https://careers.acme.com/123");
    expect(body.notes).toBe("recruiter: Jane");

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("portal_url");
    expect(sql).toContain("notes");
  });

  it("clears portalUrl when given an empty string", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeApplication, portal_url: null }],
    });
    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({ portalUrl: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);

    const vals = mockQuery.mock.calls[0][1] as unknown[];
    expect(vals).toContain(null);
  });
});

describe("DELETE /api/applications/[id]", () => {
  it("deletes the application", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = new Request("http://localhost/api/applications/a1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
