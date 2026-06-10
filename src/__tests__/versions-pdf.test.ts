import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks ──────────────────────────────────────────────────────────────────

// Mock the DB pool so we don't need a real Postgres instance.
const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: vi.fn(),
  },
  withDb: vi.fn(),
  strippedUrl: vi.fn((u: string) => u),
  createPool: vi.fn(),
}));

// Mock the compile service so we don't need a real Tectonic container.
const mockCompileTexToPdf = vi.fn();
vi.mock("@/lib/compile", () => ({
  compileTexToPdf: (...args: unknown[]) => mockCompileTexToPdf(...args),
  checkCompileService: vi.fn().mockResolvedValue(true),
}));

// Mock the renderer so we don't need the real template engine.
vi.mock("@/lib/render", () => ({
  renderResume: vi.fn().mockReturnValue("% fake tex content"),
}));

// Mock settings so template selection doesn't hit the DB.
vi.mock("@/lib/settings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({ template: "jake" }),
}));

// Import the handler after mocks are installed.
import { GET, POST } from "@/app/api/versions/route";

// ── helpers ────────────────────────────────────────────────────────────────

/** A minimal valid Resume shape for testing. */
const minResume = {
  contact: { name: "Test User" },
  sections: [],
};

// Mock pii_map row returned when the route queries master_pii_map (PRE-53).
const fakePiiMapRow = { map: { contact: { name: "Test User", phone: "", email: "", links: [] }, orgs: [] } };

/** Build a minimal POST body. */
function postBody(overrides: Record<string, unknown> = {}) {
  return {
    company: "Acme",
    role: "Engineer",
    jobDescription: "Build things",
    tailoredContent: minResume,
    outcome: "draft",
    ...overrides,
  };
}

function req(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

/** A fake compiled PDF buffer. */
const fakePdf = Buffer.from("%PDF-1.4 fake pdf content for testing");

// ── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns versions with base64 pdf when pdf column is populated", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v1",
          company: "Acme",
          role: "Engineer",
          job_description: "Build things",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: fakePdf,
        },
      ],
    });

    const res = await GET(req("GET", "http://localhost/api/versions"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("v1");
    expect(body[0].pdfBase64).toBe(fakePdf.toString("base64"));
  });

  it("returns null pdf when pdf column is null (backward compat)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v1",
          company: "Acme",
          role: "Engineer",
          job_description: "Build things",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: null,
        },
      ],
    });

    const res = await GET(req("GET", "http://localhost/api/versions"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body[0].pdfBase64).toBeNull();
  });

  it("filters by outcome when query param is provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await GET(
      req("GET", "http://localhost/api/versions?outcome=applied"),
    );

    expect(res.status).toBe(200);
    // Verify the filter was passed to the DB.
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("outcome = $1"),
      ["applied"],
    );
  });

  it("rejects invalid outcome values", async () => {
    const res = await GET(
      req("GET", "http://localhost/api/versions?outcome=invalid"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid outcome");
  });

  it("includes pdf column in the SELECT query", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await GET(req("GET", "http://localhost/api/versions"));

    const sql = mockQuery.mock.calls[0]?.[0] as string;
    expect(sql).toMatch(/pdf/);
  });
});

describe("POST /api/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompileTexToPdf.mockResolvedValue(fakePdf);
  });

  it("compiles tailored content to PDF and stores it as BYTEA", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakePiiMapRow] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v-new",
          company: "Acme",
          role: "Engineer",
          job_description: "Build things",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: fakePdf,
        },
      ],
    });

    const res = await POST(
      req("POST", "http://localhost/api/versions", postBody()),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("v-new");
    expect(body.pdfBase64).toBe(fakePdf.toString("base64"));

    // Verify the PDF was compiled.
    expect(mockCompileTexToPdf).toHaveBeenCalled();

    // Verify the INSERT includes the pdf column.
    // calls[0] is pii_map query, calls[1] is the INSERT
    const sql = mockQuery.mock.calls[1]?.[0] as string;
    expect(sql).toMatch(/pdf/);
    // The pdf value should be the Buffer passed as a parameter.
    expect(mockQuery.mock.calls[1]?.[1]).toContain(fakePdf);
  });

  it("handles compile failure gracefully — stores the version with null pdf", async () => {
    mockCompileTexToPdf.mockRejectedValueOnce(new Error("tectonic crash"));

    mockQuery.mockResolvedValueOnce({ rows: [fakePiiMapRow] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v-no-pdf",
          company: "Acme",
          role: "Engineer",
          job_description: "Build things",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: null,
        },
      ],
    });

    const res = await POST(
      req("POST", "http://localhost/api/versions", postBody()),
    );

    // Should still succeed — PDF is best-effort, version data is what matters.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pdfBase64).toBeNull();

    // Verify the INSERT wrote null for pdf.
    // calls[0] is pii_map query, calls[1] is the INSERT
    const params = mockQuery.mock.calls[1]?.[1] as unknown[];
    expect(params).toContain(null);
  });

  it("rejects request when required fields are missing", async () => {
    const res = await POST(
      req("POST", "http://localhost/api/versions", {
        company: "Acme",
        // missing role, jobDescription, tailoredContent
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/);
  });

  it("defaults outcome to 'draft' when not provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakePiiMapRow] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v3",
          company: "Acme",
          role: "Engineer",
          job_description: "Desc",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: fakePdf,
        },
      ],
    });

    const res = await POST(
      req(
        "POST",
        "http://localhost/api/versions",
        postBody({ outcome: undefined }),
      ),
    );

    expect(res.status).toBe(200);
    // calls[0] is pii_map query, calls[1] is the INSERT
    const sql = mockQuery.mock.calls[1]?.[0] as string;
    // The outcome param (positional) should be 'draft'.
    const params = mockQuery.mock.calls[1]?.[1] as string[];
    expect(params).toContain("draft");
  });
});

describe("PDF round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompileTexToPdf.mockResolvedValue(fakePdf);
  });

  it("saved PDF binary survives a round-trip: save → retrieve → decode", async () => {
    // — Save —
    mockQuery.mockResolvedValueOnce({ rows: [fakePiiMapRow] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v-rtt",
          company: "Acme",
          role: "Engineer",
          job_description: "Desc",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: fakePdf,
        },
      ],
    });

    const saveRes = await POST(
      req("POST", "http://localhost/api/versions", postBody()),
    );
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.pdfBase64).toBe(fakePdf.toString("base64"));

    // — Retrieve —
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "v-rtt",
          company: "Acme",
          role: "Engineer",
          job_description: "Desc",
          tailored_content: minResume,
          outcome: "draft",
          created_at: "2024-01-01T00:00:00Z",
          pdf: fakePdf,
        },
      ],
    });

    const getRes = await GET(req("GET", "http://localhost/api/versions"));
    expect(getRes.status).toBe(200);
    const [retrieved] = await getRes.json();
    expect(retrieved.pdfBase64).toBe(fakePdf.toString("base64"));

    // Decode and verify the binary PDF content survived.
    const decoded = Buffer.from(retrieved.pdfBase64, "base64");
    expect(decoded).toEqual(fakePdf);
  });
});
