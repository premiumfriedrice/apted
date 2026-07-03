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
      rows: [{ ...fakeApplication, outcome: "interview" }],
    });

    const req = new Request("http://localhost/api/applications/a1", {
      method: "PATCH",
      body: JSON.stringify({ outcome: "interview" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.outcome).toBe("interview");
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
