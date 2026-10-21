import { describe, it, expect } from "vitest";
import { ATS_REGISTRY, matchAts, matchesPattern, buildTrackedObj, extractFieldsFromDoc } from "../ats-registry";

describe("matchesPattern", () => {
  it("matches exact hosts and wildcard paths", () => {
    expect(matchesPattern("https://jobs.lever.co/*", "https://jobs.lever.co/acme/123")).toBe(true);
    expect(matchesPattern("https://jobs.lever.co/*", "https://other.lever.co/acme")).toBe(false);
  });

  it("matches subdomain wildcards on the dot boundary", () => {
    expect(matchesPattern("https://*.greenhouse.io/*", "https://boards.greenhouse.io/acme/jobs/1")).toBe(true);
    expect(matchesPattern("https://*.greenhouse.io/*", "https://badgreenhouse.io/acme")).toBe(false);
  });

  it("rejects wrong schemes and non-matching paths", () => {
    expect(matchesPattern("https://mail.google.com/*", "http://mail.google.com/x")).toBe(false);
    expect(matchesPattern("https://mail.google.com/*", "https://mail.google.com/")).toBe(true);
  });
});

describe("matchAts", () => {
  it("resolves each supported board", () => {
    expect(matchAts("https://boards.greenhouse.io/acme/jobs/123")?.key).toBe("greenhouse");
    expect(matchAts("https://job-boards.greenhouse.io/acme/jobs/123")?.key).toBe("greenhouse");
    expect(matchAts("https://jobs.lever.co/acme/abc-123")?.key).toBe("lever");
    expect(matchAts("https://acme.wd102.myworkdayjobs.com/en-US/careers/job/123")?.key).toBe("workday");
    expect(matchAts("https://jobs.ashbyhq.com/acme/abc123")?.key).toBe("ashby");
    expect(matchAts("https://www.linkedin.com/jobs/view/4000000000/")?.key).toBe("linkedin");
  });

  it("returns null for unsupported urls", () => {
    expect(matchAts("https://example.com/careers")).toBeNull();
  });
});

describe("buildTrackedObj", () => {
  it("builds per-ATS stable ids from URL params", () => {
    expect(buildTrackedObj("https://boards.greenhouse.io/stripe/jobs/4021853")).toBe("greenhouse:stripe/4021853");
    expect(buildTrackedObj("https://jobs.lever.co/stripe/abc-123-def")).toBe("lever:stripe/abc-123-def");
    expect(buildTrackedObj("https://jobs.ashbyhq.com/stripe/8fbc81a1")).toBe("ashbyhq:stripe/8fbc81a1");
  });

  it("resolves workday ids via path regex and company via subdomain", () => {
    expect(buildTrackedObj("https://acme.wd102.myworkdayjobs.com/en-US/careers/job/15839/Analyst")).toBe(
      "workday:acme/15839",
    );
  });

  it("resolves linkedin ids via view regex", () => {
    expect(buildTrackedObj("https://www.linkedin.com/jobs/view/4000000000/")).toBe("linkedin:4000000000");
  });

  it("returns null when a template var cannot be resolved", () => {
    // Non-job URL on a greenhouse host: no reqId path segment.
    expect(buildTrackedObj("https://boards.greenhouse.io/embed/job_app")).toBeNull();
    // No jobs/view path on LinkedIn.
    expect(buildTrackedObj("https://www.linkedin.com/jobs/collections/recommended")).toBeNull();
  });
});

describe("extractFieldsFromDoc", () => {
  it("extracts company and role from registry selectors", () => {
    document.body.innerHTML = `
      <h1 class="app-title">Software Engineer</h1>
      <div class="company-name">Acme Corp</div>
    `;
    const { company, role } = extractFieldsFromDoc(
      ATS_REGISTRY.greenhouse,
      document,
      "https://boards.greenhouse.io/acme/jobs/123",
    );
    expect(company).toBe("Acme Corp");
    expect(role).toBe("Software Engineer");
  });

  it("titlecases the company from the URL path when DOM selectors miss", () => {
    document.body.innerHTML = `<h1>Software Engineer</h1>`;
    const { company } = extractFieldsFromDoc(
      ATS_REGISTRY.lever,
      document,
      "https://jobs.lever.co/acme-labs/123",
    );
    expect(company).toBe("Acme Labs");
  });

  it("falls back to the host subdomain for workday, skipping generic labels", () => {
    document.body.innerHTML = `<h1>Analyst</h1>`;
    const { company } = extractFieldsFromDoc(
      ATS_REGISTRY.workday,
      document,
      "https://acme.wd102.myworkdayjobs.com/en-US/job/123",
    );
    expect(company).toBe("Acme");
  });
});
