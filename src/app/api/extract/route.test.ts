import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockComplete } = vi.hoisted(() => ({
  mockComplete: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  getProviderForFlow: () => ({
    name: "mock",
    model: "mock-model",
    complete: mockComplete,
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(body.error).toBe("jobDescription required");
  });

  it("returns 400 if jobDescription is empty", async () => {
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({ jobDescription: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("extracts company and title from JD text via LLM", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        company: "Leidos",
        title: "Senior Software Engineer",
        location: "Remote",
        terms: ["Python", "AWS", "microservices"],
      }),
    );
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
    expect(body.company).toBe("Leidos");
    expect(body.title).toBe("Senior Software Engineer");
    expect(body.location).toBe("Remote");
    expect(body.terms).toEqual(["Python", "AWS", "microservices"]);
  });

  it("falls back to DOM values when LLM fails", async () => {
    mockComplete.mockRejectedValue(new Error("LLM provider error"));
    const req = new Request("http://localhost/api/extract", {
      method: "POST",
      body: JSON.stringify({
        jobDescription: "Some job posting text.",
        title: "Software Engineer",
        company: "Acme Corp",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Falls back to DOM values
    expect(body.title).toBe("Software Engineer");
    expect(body.company).toBe("Acme Corp");
    expect(body.location).toBe("");
    expect(body.terms).toEqual([]);
  });

  it("works with minimal input (just jobDescription)", async () => {
    mockComplete.mockResolvedValue(
      JSON.stringify({
        company: "Rivian",
        title: "Android Developer Intern",
        location: "Palo Alto, CA",
        terms: ["Android", "Kotlin", "internship"],
      }),
    );
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
  });
});