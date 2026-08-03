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

vi.mock("@/lib/resume", () => ({
  Resume: {
    parse: vi.fn((data: unknown) => data),
  },
}));

vi.mock("@/lib/relevance", () => ({
  getRanker: vi.fn(() => async (_jd: string, versions: Array<{ company: string; role: string }>, topK: number) => {
    return versions.slice(0, topK).map((v, i) => ({
      ...v,
      score: 100 - i * 20,
    }));
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/versions/similar", () => {
  it("returns 400 if jobDescription is missing", async () => {
    const req = new Request("http://localhost/api/versions/similar", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("jobDescription required");
  });

  it("returns 400 if jobDescription is empty", async () => {
    const req = new Request("http://localhost/api/versions/similar", {
      method: "POST",
      body: JSON.stringify({ jobDescription: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns empty similar array when no versions exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = new Request("http://localhost/api/versions/similar", {
      method: "POST",
      body: JSON.stringify({ jobDescription: "React developer" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.similar).toEqual([]);
  });

  it("returns ranked similar versions with company, role, score", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "v1", company: "Acme", role: "React Developer", tailored_content: {}, created_at: "2024-01-01T00:00:00Z" },
        { id: "v2", company: "OtherCo", role: "Python Backend", tailored_content: {}, created_at: "2024-01-02T00:00:00Z" },
      ],
    });
    const req = new Request("http://localhost/api/versions/similar", {
      method: "POST",
      body: JSON.stringify({ jobDescription: "Senior React Engineer" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.similar).toHaveLength(2);
    expect(body.similar[0]).toHaveProperty("company");
    expect(body.similar[0]).toHaveProperty("role");
    expect(body.similar[0]).toHaveProperty("score");
    expect(body.similar[0].score).toBe(100);
    expect(body.similar[1].score).toBe(80);
  });

  it("filters out versions with score <= 10", async () => {
    const { getRanker } = await import("@/lib/relevance");
    (getRanker as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      async () => [
        { id: "v1", company: "Acme", role: "React Developer", tailored_content: {}, created_at: "2024-01-01T00:00:00Z", score: 5 },
        { id: "v2", company: "OtherCo", role: "Python Backend", tailored_content: {}, created_at: "2024-01-02T00:00:00Z", score: 80 },
      ]
    );
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "v1", company: "Acme", role: "React Developer", tailored_content: {}, created_at: "2024-01-01T00:00:00Z" },
        { id: "v2", company: "OtherCo", role: "Python Backend", tailored_content: {}, created_at: "2024-01-02T00:00:00Z" },
      ],
    });
    const req = new Request("http://localhost/api/versions/similar", {
      method: "POST",
      body: JSON.stringify({ jobDescription: "React" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.similar).toHaveLength(1);
    expect(body.similar[0].company).toBe("OtherCo");
    expect(body.similar[0].score).toBe(80);
  });
});
