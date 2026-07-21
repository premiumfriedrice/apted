import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock cache + generation functions (PRE-88) ──────────────────────────────
const mockGetCached = vi.fn();
const mockSave = vi.fn();
const mockGenerate = vi.fn();
vi.mock("@/lib/insights", () => ({
  generateInsights: (...args: unknown[]) => mockGenerate(...args),
  getCachedInsights: (...args: unknown[]) => mockGetCached(...args),
  saveInsights: (...args: unknown[]) => mockSave(...args),
}));

// ── Mock auth ────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("local"),
  LOCAL_USER_ID: "local",
}));

// ── Mock pool ────────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
  withDb: vi.fn(),
  strippedUrl: vi.fn((u: string) => u),
  createPool: vi.fn(),
}));

// Resume.parse is called on tailored_content. Pass through valid objects.
vi.mock("@/lib/resume", () => ({
  Resume: { parse: (v: unknown) => v },
}));

async function loadRoute() {
  return import("@/app/api/versions/[id]/insights/route");
}

const fakeResume = { contact: { name: "Alice" }, sections: [] };
const fakeRow = { tailored_content: fakeResume, applications: [] };

const generated = {
  summary: "generated summary",
  keywords: ["k1"],
  strengths: ["s1"],
  tone: "toned",
};
const cached = {
  summary: "cached summary",
  keywords: ["ck1"],
  strengths: ["cs1"],
  tone: "cached-tone",
};

beforeEach(() => {
  vi.clearAllMocks();
  // version + applications join query always returns the version row.
  mockQuery.mockResolvedValue({ rows: [fakeRow] });
  mockSave.mockResolvedValue(undefined);
  mockGenerate.mockResolvedValue(generated);
});

describe("GET /api/versions/[id]/insights — caching (PRE-88)", () => {
  it("returns cached insights without generating", async () => {
    mockGetCached.mockResolvedValue(cached);
    const { GET } = await loadRoute();
    const req = new Request("http://localhost/api/versions/v1/insights");
    const res = await GET(req, { params: Promise.resolve({ id: "v1" }) });
    const body = await res.json();

    expect(body).toEqual(cached);
    expect(mockGetCached).toHaveBeenCalledWith("v1", "local");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("generates, persists, and returns insights on a cache miss", async () => {
    mockGetCached.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const req = new Request("http://localhost/api/versions/v1/insights");
    const res = await GET(req, { params: Promise.resolve({ id: "v1" }) });
    const body = await res.json();

    expect(body).toEqual(generated);
    expect(mockGetCached).toHaveBeenCalledWith("v1", "local");
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith("v1", "local", generated);
  });

  it("skips the cache and regenerates when refresh=true", async () => {
    mockGetCached.mockResolvedValue(cached);
    const { GET } = await loadRoute();
    const req = new Request(
      "http://localhost/api/versions/v1/insights?refresh=true",
    );
    const res = await GET(req, { params: Promise.resolve({ id: "v1" }) });
    const body = await res.json();

    expect(body).toEqual(generated);
    // Cache is bypassed entirely.
    expect(mockGetCached).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith("v1", "local", generated);
  });
});