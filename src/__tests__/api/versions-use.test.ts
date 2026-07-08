import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
  withDb: vi.fn(),
  strippedUrl: vi.fn((u: string) => u),
  createPool: vi.fn(),
}));

vi.mock("@/lib/resume", () => ({
  Resume: {
    parse: vi.fn((data: unknown) => data),
  },
}));

import { POST } from "@/app/api/versions/[id]/use/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
});

describe("POST /api/versions/[id]/use", () => {
  it("creates a draft from a version using the latest application job description", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        tailored_content: { contact: { name: "Alice" }, sections: [] },
        job_description: "Build things",
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "draft-1",
        job_description: "Build things",
        content: { contact: { name: "Alice" }, sections: [] },
        history: [],
        created_at: "2026-07-03T00:00:00Z",
        updated_at: "2026-07-03T00:00:00Z",
      }],
    });

    const req = new Request("http://localhost/api/versions/v1/use", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "v1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("draft-1");
    expect(body.jobDescription).toBe("Build things");

    const selectSql = mockQuery.mock.calls[0][0] as string;
    expect(selectSql).toContain("resume_versions v");
    expect(selectSql).toContain("applications");
  });

  it("falls back to empty job description when version has no applications", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        tailored_content: { contact: { name: "Bob" }, sections: [] },
        job_description: null,
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "draft-2",
        job_description: "",
        content: { contact: { name: "Bob" }, sections: [] },
        history: [],
        created_at: "2026-07-03T00:00:00Z",
        updated_at: "2026-07-03T00:00:00Z",
      }],
    });

    const req = new Request("http://localhost/api/versions/v2/use", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "v2" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when version does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = new Request("http://localhost/api/versions/nope/use", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});
