import { describe, it, expect, beforeEach } from "vitest";
import { scrapeJob } from "../scrapers";

describe("scrapeJob", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  // ── JD text extraction per site ──────────────────────────────────────────

  it("extracts LinkedIn JD text", () => {
    document.body.innerHTML = `
      <div class="jobs-description__content">
        <div class="jobs-description-content__text">
          <p>We are looking for a Software Engineer.</p>
          <p>Build scalable systems.</p>
        </div>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "www.linkedin.com", href: "https://www.linkedin.com/jobs/view/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("linkedin");
    expect(result.jobDescription).toContain("Build scalable systems");
  });

  it("extracts Greenhouse JD text", () => {
    document.body.innerHTML = `
      <h1 class="app-title">Product Designer</h1>
      <div id="content">
        <p>Design beautiful interfaces.</p>
        <p>Work with a world-class team.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "boards.greenhouse.io", href: "https://boards.greenhouse.io/acme/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("greenhouse");
    expect(result.jobDescription).toContain("Design beautiful interfaces");
  });

  it("extracts Lever JD text", () => {
    document.body.innerHTML = `
      <div class="posting-headline"><h2>Backend Engineer</h2></div>
      <div class="section-wrapper page-full-width">
        <p>Design APIs and services.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "jobs.lever.co", href: "https://jobs.lever.co/acme/123", pathname: "/acme/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("lever");
    expect(result.jobDescription).toContain("Design APIs and services");
  });

  it("extracts Workday JD text", () => {
    document.body.innerHTML = `
      <h2 data-automation-id="jobPostingHeader">Data Scientist</h2>
      <div data-automation-id="jobPostingDescription">
        <p>Apply ML to real-world problems.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "acme.wd102.myworkdayjobs.com", href: "https://acme.wd102.myworkdayjobs.com/en-US/careers/job/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("workday");
    expect(result.jobDescription).toContain("Apply ML to real-world problems");
  });

  it("extracts Ashby JD text", () => {
    document.body.innerHTML = `
      <h1 data-testid="job-title">Platform Engineer</h1>
      <div data-testid="job-description">
        <p>Build infrastructure.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "jobs.ashbyhq.com", href: "https://jobs.ashbyhq.com/acme/123", pathname: "/acme/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("ashby");
    expect(result.jobDescription).toContain("Build infrastructure");
  });

  // ── Title and company from DOM (fallback when LLM unavailable) ───────

  it("extracts title and company from Greenhouse DOM", () => {
    document.body.innerHTML = `
      <h1 class="app-title">Software Engineer</h1>
      <div class="company-name">Acme Corp</div>
      <main>
        <p>We are hiring. Build great things.</p>
        <p>Requirements: 5+ years of experience.</p>
        <p>Benefits: Health, dental, 401k.</p>
        <p>We offer competitive salary and remote work.</p>
      </main>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "boards.greenhouse.io", href: "https://boards.greenhouse.io/acme/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.title).toBe("Software Engineer");
    expect(result.company).toBe("Acme Corp");
    expect(result.jobDescription).toBeTruthy();
  });

  // ── Generic fallback for unknown sites ─────────────────────────────────────

  it("uses generic fallback for unknown sites", () => {
    document.body.innerHTML = `
      <h1>Full Stack Engineer</h1>
      <main>
        <p>We need a full-stack engineer.</p>
        <p>Remote first.</p>
        <p>Competitive salary.</p>
        <p>Great benefits package.</p>
      </main>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "unknown.com", href: "https://unknown.com/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("generic");
    expect(result.jobDescription).toContain("We need a full-stack engineer");
    expect(result.title).toBe("Full Stack Engineer");
  });
});