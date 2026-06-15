import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the structure provider to return deterministic extraction results.
const mockComplete = vi.fn();

vi.mock("@/lib/providers", () => ({
  getStructureProvider: () => ({
    name: "mock",
    model: "mock-model",
    complete: mockComplete,
  }),
}));

vi.mock("@/lib/llm", () => ({
  callAndParse: vi.fn(async (_provider, _systemPrompt, userPrompt, parse) => {
    // Simulate LLM extraction based on the JD content.
    const result = mockComplete(userPrompt);
    return parse(result);
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mockComplete.mockReturnValue({
    title: "Android Developer Intern",
    company: "Rivian",
    location: "Palo Alto, CA",
    terms: ["Android", "Kotlin", "internship"],
  });
});

describe("POST /api/extract", () => {
  it("returns 400 if jobDescription is missing", async () => {
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request body");
  });

  it("returns 400 if jobDescription is empty", async () => {
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({ jobDescription: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("extracts fields from a job description", async () => {
    mockComplete.mockReturnValue({
      title: "Senior Software Engineer",
      company: "Leidos",
      location: "Remote",
      terms: ["Python", "AWS", "microservices"],
    });
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({
        jobDescription: "Senior Software Engineer at Leidos. Remote. Python, AWS.",
        url: "https://careers.leidos.com/jobs/123",
        title: "Senior Software Engineer",
        company: "leidos",
        source: "generic",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Senior Software Engineer");
    expect(body.company).toBe("Leidos");
    expect(body.location).toBe("Remote");
    expect(body.terms).toEqual(["Python", "AWS", "microservices"]);
  });

  it("works with minimal input (just jobDescription)", async () => {
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({
        jobDescription: "We are hiring an Android Developer Intern at Rivian in Palo Alto.",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Android Developer Intern");
    expect(body.company).toBe("Rivian");
    expect(body.location).toBe("Palo Alto, CA");
    expect(Array.isArray(body.terms)).toBe(true);
  });

  it("returns 500 when LLM extraction fails", async () => {
    mockComplete.mockImplementation(() => {
      throw new Error("LLM provider error");
    });
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({
        jobDescription: "Some job posting text.",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("LLM provider error");
  });
});