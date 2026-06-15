import { describe, it, expect, beforeEach } from "vitest";
import { scrapeJob } from "../scrapers";

describe("scrapeJob", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  it("extracts LinkedIn job details", () => {
    document.title = "Software Engineer at Acme Corp";
    document.body.innerHTML = `
      <div class="job-details-jobs-unified-top-card__job-title"><h1>Software Engineer</h1></div>
      <div class="job-details-jobs-unified-top-card__company-name"><a>Acme Corp</a></div>
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
    expect(result.title).toBe("Software Engineer");
    expect(result.company).toBe("Acme Corp");
    expect(result.jobDescription).toContain("Build scalable systems");
  });

  it("extracts Greenhouse job details", () => {
    document.title = "Product Designer - Acme Corp";
    document.body.innerHTML = `
      <h1 class="app-title">Product Designer</h1>
      <div class="company-name">Acme Corp</div>
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
    expect(result.title).toBe("Product Designer");
    expect(result.company).toBe("Acme Corp");
    expect(result.jobDescription).toContain("Design beautiful interfaces");
  });

  it("extracts Greenhouse company from page title when selector missing", () => {
    document.title = "Senior Engineer — Widgets Inc";
    document.body.innerHTML = `
      <h1 class="app-title">Senior Engineer</h1>
      <div id="content">
        <p>Build things.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "job-boards.greenhouse.io", href: "https://job-boards.greenhouse.io/acme/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("greenhouse");
    expect(result.title).toBe("Senior Engineer");
    expect(result.company).toBe("Widgets Inc");
  });

  it("extracts Lever job details", () => {
    document.body.innerHTML = `
      <div class="posting-headline"><h2>Backend Engineer</h2></div>
      <div class="main-header-text">Acme Corp</div>
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
    expect(result.title).toBe("Backend Engineer");
    expect(result.company).toBe("Acme Corp");
    expect(result.jobDescription).toContain("Design APIs and services");
  });

  it("extracts Lever company from URL path when selector missing", () => {
    document.body.innerHTML = `
      <div class="posting-headline"><h2>Frontend Engineer</h2></div>
      <div class="section-wrapper page-full-width">
        <p>Build UI.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "jobs.lever.co", href: "https://jobs.lever.co/widgetco/123", pathname: "/widgetco/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("lever");
    expect(result.title).toBe("Frontend Engineer");
    expect(result.company).toBe("widgetco");
  });

  it("extracts Workday job details", () => {
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
    expect(result.title).toBe("Data Scientist");
    expect(result.company).toBe("Acme");
    expect(result.jobDescription).toContain("Apply ML to real-world problems");
  });

  it("extracts Workday company from page title when subdomain is generic", () => {
    document.body.innerHTML = `
      <h2 data-automation-id="jobPostingHeader">Manager</h2>
      <div data-automation-id="jobPostingDescription">
        <p>Lead teams.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "www.myworkdayjobs.com", href: "https://www.myworkdayjobs.com/en-US/careers/job/123" },
      writable: true,
    });
    document.title = "Manager at WidgetCo";

    const result = scrapeJob();
    expect(result.source).toBe("workday");
    expect(result.title).toBe("Manager");
    expect(result.company).toBe("WidgetCo");
  });

  it("extracts Ashby job details from URL path", () => {
    document.body.innerHTML = `
      <h1 data-testid="job-title">Platform Engineer</h1>
      <div data-testid="company-name">Acme Corp</div>
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
    expect(result.title).toBe("Platform Engineer");
    expect(result.company).toBe("acme");
    expect(result.jobDescription).toContain("Build infrastructure");
  });

  it("extracts Ashby company from URL path when selector missing", () => {
    document.body.innerHTML = `
      <h1>Staff Engineer</h1>
      <div data-testid="job-description">
        <p>Lead architecture.</p>
      </div>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "jobs.ashbyhq.com", href: "https://jobs.ashbyhq.com/rivianvw.tech/123", pathname: "/rivianvw.tech/123" },
      writable: true,
    });
    document.title = "Acme Corp | Staff Engineer";

    const result = scrapeJob();
    expect(result.source).toBe("ashby");
    expect(result.title).toBe("Staff Engineer");
    expect(result.company).toBe("rivianvw.tech");
  });

  it("parses company and title from JD text fallback (dash pattern)", () => {
    document.body.innerHTML = `
      <main>
        <p>Acme Corp — Software Engineer</p>
        <p>Build great things.</p>
        <p>We are a fast-growing startup.</p>
      </main>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "example.com", href: "https://example.com/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("generic");
    expect(result.title).toBe("Software Engineer");
    expect(result.company).toBe("Acme Corp");
  });

  it("parses company and title from JD text fallback (at pattern)", () => {
    document.body.innerHTML = `
      <main>
        <p>Product Manager at Widgets Inc</p>
        <p>Drive product strategy.</p>
      </main>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "example.com", href: "https://example.com/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("generic");
    expect(result.title).toBe("Product Manager");
    expect(result.company).toBe("Widgets Inc");
  });

  it("parses company and title from JD text fallback (hiring pattern)", () => {
    document.body.innerHTML = `
      <main>
        <p>TechCorp is hiring a Senior Developer</p>
        <p>Write code.</p>
      </main>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "example.com", href: "https://example.com/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("generic");
    expect(result.title).toBe("Senior Developer");
    expect(result.company).toBe("TechCorp");
  });

  it("uses generic fallback for unknown sites", () => {
    document.body.innerHTML = `
      <main>
        <p>We need a full-stack engineer.</p>
        <p>Remote first.</p>
      </main>
    `;
    Object.defineProperty(window, "location", {
      value: { host: "unknown.com", href: "https://unknown.com/jobs/123" },
      writable: true,
    });

    const result = scrapeJob();
    expect(result.source).toBe("generic");
    expect(result.jobDescription).toContain("We need a full-stack engineer");
  });
});
