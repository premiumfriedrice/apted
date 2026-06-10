import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock compileTexToPdf ────────────────────────────────────────────────────
const mockCompile = vi.fn();
vi.mock("@/lib/compile", () => ({
  compileTexToPdf: (...args: unknown[]) => mockCompile(...args),
  checkCompileService: vi.fn().mockResolvedValue(true),
}));

// ── Mock getUserSettings ─────────────────────────────────────────────────────
vi.mock("@/lib/settings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({ template: "jake" }),
}));

// ── Mock pool ────────────────────────────────────────────────────────────────
// The route handlers call pool.query(sql, params). We build a per-test mock
// so each test can control what the DB returns.
const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
  withDb: vi.fn(),
  strippedUrl: vi.fn((u: string) => u),
  createPool: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
const fakePdf = Buffer.from("%PDF-1.4 fake pdf content");

function makeVersionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "v1-uuid",
    company: "Acme Corp",
    role: "Staff Engineer",
    job_description: "Build things",
    tailored_content: {
      contact: { name: "Alice", email: "a@b.com", phone: "", links: [] },
      sections: [],
    },
    outcome: "draft",
    created_at: "2026-06-10T00:00:00.000Z",
    pdf: fakePdf,
    ...overrides,
  };
}

function makeVersionResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "v1-uuid",
    company: "Acme Corp",
    role: "Staff Engineer",
    jobDescription: "Build things",
    tailoredContent: {
      contact: { name: "Alice", email: "a@b.com", phone: "", links: [] },
      sections: [],
    },
    outcome: "draft",
    createdAt: "2026-06-10T00:00:00.000Z",
    pdf: fakePdf.toString("base64"),
    ...overrides,
  };
}

// Dynamic import so mocks are in place before the module loads.
async function loadVersionsRoute() {
  return import("@/app/api/versions/route");
}
async function loadVersionByIdRoute() {
  return import("@/app/api/versions/[id]/route");
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  mockCompile.mockResolvedValue(fakePdf);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PDF compile + store BYTEA round-trip on version save
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/versions — PDF compile + store round-trip", () => {
  it("compiles tailoredContent to PDF and stores binary in the pdf column", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeVersionRow()] });

    const { POST } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme Corp",
        role: "Staff Engineer",
        jobDescription: "Build things",
        tailoredContent: {
          contact: { name: "Alice", email: "a@b.com", phone: "", links: [] },
          sections: [],
        },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    // compileTexToPdf was called
    expect(mockCompile).toHaveBeenCalledOnce();

    // INSERT included pdf as $6 (BYTEA)
    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall[0]).toContain("INSERT INTO resume_versions");
    expect(insertCall[0]).toContain("pdf");
    // 6th param ($6) is the pdf buffer
    expect(insertCall[1][5]).toEqual(fakePdf);

    // Response includes base64 PDF
    expect(body.pdfBase64).toBe(fakePdf.toString("base64"));
  });

  it("saves version without PDF when compile fails (non-fatal)", async () => {
    mockCompile.mockRejectedValueOnce(new Error("compile service down"));
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow({ pdf: null })],
    });

    const { POST } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme Corp",
        role: "Staff Engineer",
        jobDescription: "Build things",
        tailoredContent: {
          contact: { name: "Alice" },
          sections: [],
        },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    // Still succeeds (200, not 500)
    expect(res.status).toBe(200);
    expect(body.id).toBe("v1-uuid");
    // pdf is null in the response
    expect(body.pdfBase64).toBeNull();

    // INSERT still happened, pdf param was null
    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall[1][5]).toBeNull();
  });

  it("defaults outcome to 'draft' when omitted", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow()],
    });

    const { POST } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme Corp",
        role: "Staff Engineer",
        jobDescription: "Build things",
        tailoredContent: {
          contact: { name: "Alice" },
          sections: [],
        },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.outcome).toBe("draft");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. API returns PDF alongside JSON
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/versions — returns PDF alongside JSON", () => {
  it("returns base64 PDF for every version in the list", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeVersionRow({ id: "v1", pdf: fakePdf }),
        makeVersionRow({ id: "v2", pdf: null }),
      ],
    });

    const { GET } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions");
    const res = await GET(req);
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0].pdfBase64).toBe(fakePdf.toString("base64"));
    expect(body[1].pdfBase64).toBeNull();
  });

  it("returns base64 PDF for a single version GET by id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeVersionRow()] });

    const { GET } = await loadVersionByIdRoute();
    const req = new Request("http://localhost/api/versions/v1-uuid");
    const res = await GET(req, { params: Promise.resolve({ id: "v1-uuid" }) });
    const body = await res.json();

    expect(body.pdfBase64).toBe(fakePdf.toString("base64"));
  });

  it("returns 404 when version id does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { GET } = await loadVersionByIdRoute();
    const req = new Request("http://localhost/api/versions/nope");
    const res = await GET(req, { params: Promise.resolve({ id: "nope" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Library renders cards for all versions (API contract)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/versions — contract for library card rendering", () => {
  it("response includes all fields a library card needs", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow()],
    });

    const { GET } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions");
    const res = await GET(req);
    const body = await res.json();

    const card = body[0];
    // Fields needed for card rendering (PRE-57):
    expect(card).toHaveProperty("id");
    expect(card).toHaveProperty("company");
    expect(card).toHaveProperty("role");
    expect(card).toHaveProperty("outcome");
    expect(card).toHaveProperty("createdAt");
    expect(card).toHaveProperty("pdfBase64"); // base64 PDF for embed
    expect(card).toHaveProperty("tailoredContent"); // needed for JSON toggle
  });

  it("every version has pdf field (may be null)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeVersionRow({ id: "v1", pdf: fakePdf }),
        makeVersionRow({ id: "v2", pdf: null }),
        makeVersionRow({ id: "v3", pdf: fakePdf }),
      ],
    });

    const { GET } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions");
    const res = await GET(req);
    const body = await res.json();

    for (const card of body) {
      // pdf field must exist on every row (even if null or base64 string)
      expect(card).toHaveProperty("pdfBase64");
      expect(card.pdfBase64 === null || typeof card.pdfBase64 === "string").toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. JSON toggle switches view (API contract)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/versions — API contract for JSON toggle", () => {
  it("tailoredContent is a JSON object suitable for syntax-highlighted display", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow()],
    });

    const { GET } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions");
    const res = await GET(req);
    const body = await res.json();

    const card = body[0];
    // tailoredContent must be a parseable object
    expect(typeof card.tailoredContent).toBe("object");
    expect(card.tailoredContent).not.toBeNull();
    // It must have the Resume shape
    expect(card.tailoredContent).toHaveProperty("contact");
    expect(card.tailoredContent).toHaveProperty("sections");
  });

  it("both pdf and tailoredContent exist so toggle can switch between them", async () => {
    mockQuery.mockResolvedValue({ rows: [makeVersionRow()] });

    const { GET } = await loadVersionByIdRoute();
    const req = new Request("http://localhost/api/versions/v1-uuid");
    const res = await GET(req, { params: Promise.resolve({ id: "v1-uuid" }) });
    const body = await res.json();

    // pdf: base64 string for PDF embed view
    expect(typeof body.pdfBase64).toBe("string");
    // tailoredContent: JSON object for read-only JSON view
    expect(typeof body.tailoredContent).toBe("object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Outcome filter shows correct subset
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/versions?outcome=X — outcome filter", () => {
  it("passes outcome to the SQL query and returns filtered results", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow({ outcome: "interview" })],
    });

    const { GET } = await loadVersionsRoute();
    const req = new Request(
      "http://localhost/api/versions?outcome=interview",
    );
    const res = await GET(req);
    const body = await res.json();

    // SQL includes WHERE outcome = $1
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("WHERE outcome = $1");
    expect(params[0]).toBe("interview");

    expect(body).toHaveLength(1);
    expect(body[0].outcome).toBe("interview");
  });

  it("returns all outcomes when no filter is provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeVersionRow({ id: "a", outcome: "draft" }),
        makeVersionRow({ id: "b", outcome: "offer" }),
        makeVersionRow({ id: "c", outcome: "rejected" }),
      ],
    });

    const { GET } = await loadVersionsRoute();
    const req = new Request("http://localhost/api/versions");
    const res = await GET(req);
    const body = await res.json();

    expect(body).toHaveLength(3);
    const outcomes = body.map((v: { outcome: string }) => v.outcome);
    expect(outcomes).toContain("draft");
    expect(outcomes).toContain("offer");
    expect(outcomes).toContain("rejected");
  });

  it("returns 400 for invalid outcome value", async () => {
    const { GET } = await loadVersionsRoute();
    const req = new Request(
      "http://localhost/api/versions?outcome=invalid",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid outcome");
    // SQL must not be called for invalid params
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("accepts all 5 valid outcome values", async () => {
    mockQuery.mockResolvedValue({ rows: [makeVersionRow()] });

    const { GET } = await loadVersionsRoute();
    const validOutcomes = ["draft", "applied", "interview", "offer", "rejected"];

    for (const oc of validOutcomes) {
      mockQuery.mockClear();
      const req = new Request(
        `http://localhost/api/versions?outcome=${oc}`,
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledOnce();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/versions/[id] — re-compile PDF on tailoredContent change
// ═══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/versions/[id] — re-compile PDF", () => {
  it("re-compiles PDF when tailoredContent is updated", async () => {
    // Return existing version before update
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow()],
    });

    const { PATCH } = await loadVersionByIdRoute();
    const req = new Request("http://localhost/api/versions/v1-uuid", {
      method: "PATCH",
      body: JSON.stringify({
        tailoredContent: {
          contact: { name: "Bob" },
          sections: [],
        },
      }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "v1-uuid" }),
    });
    const body = await res.json();

    // compileTexToPdf was called again
    expect(mockCompile).toHaveBeenCalledOnce();
    // UPDATE included pdf column
    const updateCall = mockQuery.mock.calls[0];
    expect(updateCall[0]).toContain("pdf = $");
    // Response includes base64 PDF
    expect(body.pdfBase64).toBe(fakePdf.toString("base64"));
  });

  it("does not re-compile when only outcome changes", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeVersionRow()],
    });

    const { PATCH } = await loadVersionByIdRoute();
    const req = new Request("http://localhost/api/versions/v1-uuid", {
      method: "PATCH",
      body: JSON.stringify({ outcome: "interview" }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "v1-uuid" }),
    });
    expect(res.status).toBe(200);

    // compileTexToPdf was NOT called (outcome-only change)
    expect(mockCompile).not.toHaveBeenCalled();
  });

  it("returns 400 when no fields are provided", async () => {
    const { PATCH } = await loadVersionByIdRoute();
    const req = new Request("http://localhost/api/versions/v1-uuid", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "v1-uuid" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("no fields");
  });
});
