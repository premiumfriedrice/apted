// scrapeJob runs in the active tab's page context via chrome.scripting.executeScript({ func }).
// It MUST be self-contained — no module-level identifiers from the bundle survive serialization.

import type { ScrapedJob } from "./types";

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrapeJob(): ScrapedJob {
  const host = location.host.toLowerCase();
  const url = location.href;

  const norm = (el: Element | null | undefined): string =>
    (el?.textContent ?? "").replace(/\s+/g, " ").trim();

  const blockText = (el: Element | null | undefined): string => {
    if (!el) return "";
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
    const BLOCKS = new Set([
      "p", "div", "li", "ul", "ol", "section", "article",
      "br", "h1", "h2", "h3", "h4", "h5", "h6", "tr",
    ]);
    let out = "";
    const walk = (n: Node): void => {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.nodeValue ?? "";
        return;
      }
      if (!(n instanceof HTMLElement)) return;
      const isBlock = BLOCKS.has(n.tagName.toLowerCase());
      if (isBlock) out += "\n";
      for (const c of Array.from(n.childNodes)) walk(c);
      if (isBlock) out += "\n";
    };
    walk(clone);
    return out
      .replace(/[ \t ]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const firstMatch = (sels: string[]): Element | null => {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && (el.textContent ?? "").trim()) return el;
    }
    return null;
  };

  let source: ScrapedJob["source"] = "generic";
  let title = "";
  let company = "";
  let jd = "";

  if (host.endsWith("linkedin.com")) {
    source = "linkedin";
    title = norm(
      firstMatch([
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title",
        "h1.t-24",
        "h1",
      ]),
    );
    company = norm(
      firstMatch([
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".job-details-jobs-unified-top-card__primary-description a",
        "[data-test-id='job-title'] a",
      ]),
    );
    jd = blockText(
      firstMatch([
        ".jobs-description__content .jobs-description-content__text",
        ".jobs-description__content",
        "#job-details",
        ".jobs-description__container",
        ".jobs-box__html-content",
        "[data-test-id='job-description']",
      ]),
    );
  } else if (host.endsWith("greenhouse.io")) {
    source = "greenhouse";
    title = norm(firstMatch([".app-title", "h1.app-title", "h1[data-testid='job-title']", "h1"]));
    company = norm(firstMatch([".company-name", ".header-brand a", "[data-testid='company-name']"])).replace(/^at\s+/i, "");
    if (!company) {
      // Try to extract from the page title: "Job Title - Company Name"
      const titleParts = document.title.split(/[-–—|]/);
      const lastPart = titleParts[titleParts.length - 1];
      if (lastPart) company = lastPart.trim();
    }
    jd = blockText(
      firstMatch(["#content", ".content", "#app_body", "[data-testid='job-description']", "main"]),
    );
  } else if (host.endsWith("lever.co")) {
    source = "lever";
    title = norm(firstMatch([".posting-headline h2", ".posting-headline h1", ".posting-headline", "h2", "h1"]));
    company =
      (norm(firstMatch([".main-header-text", ".main-header a", ".logo a", "[data-qa='company-name']"])) ||
      location.pathname.split("/").filter(Boolean)[0] ||
      "");
    jd = blockText(
      firstMatch([
        ".section-wrapper.page-full-width",
        ".section.page-centered",
        ".posting",
        "[data-qa='job-description']",
        "main",
      ]),
    );
  } else if (host.endsWith("myworkdayjobs.com") || host.endsWith("workday.com")) {
    source = "workday";
    title = norm(
      firstMatch([
        "[data-automation-id='jobPostingHeader']",
        "h2[data-automation-id='jobPostingHeader']",
        "h1[data-automation-id='jobPostingHeader']",
        "h2[data-automation-id]",
        "h1",
      ]),
    );
    const sub = host.split(".")[0] ?? "";
    const GENERIC_SUBDOMAINS = new Set(["www", "jobs", "careers", "workday", "myworkdayjobs", "wd102", "wd1", "wd2", "wd3"]);
    company = sub && !GENERIC_SUBDOMAINS.has(sub) ? sub.charAt(0).toUpperCase() + sub.slice(1) : "";
    // Workday sometimes embeds company in the page title
    if (!company && document.title) {
      const titleMatch = document.title.match(/at\s+([^-|]+)/i);
      if (titleMatch) company = titleMatch[1]?.trim() ?? "";
    }
    jd = blockText(
      firstMatch([
        "[data-automation-id='jobPostingDescription']",
        "[data-automation-id='postingDescription']",
        "[data-automation-id='description']",
        "[data-testid='job-description']",
      ]),
    );
  } else if (host.endsWith("ashbyhq.com")) {
    source = "ashby";
    title = norm(firstMatch(["h1[data-testid='job-title']", "h1", "[data-testid='job-title']"]));
    // Ashby URLs: https://jobs.ashbyhq.com/company-name/job-id
    // The company is always the first path segment.
    const pathParts = (location.pathname ?? "").split("/").filter(Boolean);
    const rawSlug = pathParts[0] ?? "";
    // Title-case the slug: "leidos" → "Leidos", "company-name" → "Company Name"
    company = rawSlug
      ? rawSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    // If the URL doesn't have a company slug, fall back to DOM selectors.
    if (!company) {
      company = norm(firstMatch(["[data-testid='company-name']", "a[href^='/jobs']", "header a"]));
    }
    jd = blockText(
      firstMatch([
        "[data-testid='job-description']",
        "[data-testid='description']",
        "[data-qa='job-description']",
        "main",
        "article",
      ]),
    );
  }

  // Fallback: parse company/title from the first few lines of the JD if still missing.
  if (jd && (!title || !company)) {
    const lines = jd.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const firstBlock = lines.slice(0, 10).join("\n");

    // Pattern: "Company Name — Job Title" or "Company Name - Job Title"
    const dashMatch = firstBlock.match(/^([^\n–—-]+)[–—-]\s*([^\n]+)/m);
    if (dashMatch) {
      if (!company) company = dashMatch[1]?.trim() ?? "";
      if (!title) title = dashMatch[2]?.trim() ?? "";
    }

    // Pattern: "Job Title at Company Name"
    if (!title || !company) {
      const atMatch = firstBlock.match(/^([^\n]+?)\s+at\s+([^\n]+)/mi);
      if (atMatch) {
        if (!title) title = atMatch[1]?.trim() ?? "";
        if (!company) company = atMatch[2]?.trim() ?? "";
      }
    }

    // Pattern: "Company Name | Job Title"
    if (!title || !company) {
      const pipeMatch = firstBlock.match(/^([^\n|]+)\|\s*([^\n]+)/m);
      if (pipeMatch) {
        if (!company) company = pipeMatch[1]?.trim() ?? "";
        if (!title) title = pipeMatch[2]?.trim() ?? "";
      }
    }

    // Pattern: "Company Name is hiring a Job Title"
    if (!title || !company) {
      const hiringMatch = firstBlock.match(/^([^\n]+?)\s+is\s+hiring\s+(?:a|an)?\s*([^\n]+)/mi);
      if (hiringMatch) {
        if (!company) company = hiringMatch[1]?.trim() ?? "";
        if (!title) title = hiringMatch[2]?.trim() ?? "";
      }
    }
  }

  if (!jd) {
    // Generic fallback: pick the densest text-bearing block on the page.
    const candidates = Array.from(
      document.querySelectorAll("main, article, [role='main'], section, div"),
    )
      .map((el) => ({ el, len: (el.textContent ?? "").trim().length }))
      .filter((c) => c.len > 400)
      .sort((a, b) => b.len - a.len);
    jd = blockText(candidates[0]?.el ?? document.body);
    if (!title) title = norm(firstMatch(["h1", "h2"]));
    if (!company) {
      company = norm(document.querySelector("meta[property='og:site_name']"));
    }
  }

  // Fallback: parse company/title from the JD text if still missing after generic fallback.
  if (jd && (!title || !company)) {
    const lines = jd.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const firstBlock = lines.slice(0, 10).join("\n");

    const dashMatch = firstBlock.match(/^([^\n–—-]+)[–—-]\s*([^\n]+)/m);
    if (dashMatch) {
      if (!company) company = dashMatch[1]?.trim() ?? "";
      if (!title) title = dashMatch[2]?.trim() ?? "";
    }

    if (!title || !company) {
      const atMatch = firstBlock.match(/^([^\n]+?)\s+at\s+([^\n]+)/mi);
      if (atMatch) {
        if (!title) title = atMatch[1]?.trim() ?? "";
        if (!company) company = atMatch[2]?.trim() ?? "";
      }
    }

    if (!title || !company) {
      const pipeMatch = firstBlock.match(/^([^\n|]+)\|\s*([^\n]+)/m);
      if (pipeMatch) {
        if (!company) company = pipeMatch[1]?.trim() ?? "";
        if (!title) title = pipeMatch[2]?.trim() ?? "";
      }
    }

    if (!title || !company) {
      const hiringMatch = firstBlock.match(/^([^\n]+?)\s+is\s+hiring\s+(?:a|an)?\s*([^\n]+)/mi);
      if (hiringMatch) {
        if (!company) company = hiringMatch[1]?.trim() ?? "";
        if (!title) title = hiringMatch[2]?.trim() ?? "";
      }
    }
  }

  // Final fallback: if title is still missing but company is present, try page title
  if (!title && document.title) {
    const possibleTitle = document.title.replace(new RegExp(`(?:\\s*[-|–—]\\s*)?${escRegex(company)}`, "i"), "").trim();
    if (possibleTitle && possibleTitle !== document.title) title = possibleTitle;
  }

  // Clean up: strip date suffixes like "- Fall 2026", "- Summer 2026", etc.
  if (title) {
    const seasonSuffix = /\s*[-–—]\s*(?:fall|spring|summer|winter)\s*\d{4}/i;
    title = title.replace(seasonSuffix, "").trim();
  }

  // Last-resort: if company is still missing, try domain name and page title.
  if (!company && host) {
    const domainParts = host.split(".");
    const domain = domainParts[domainParts.length - 2] ?? "";
    if (domain && domain !== "com" && domain !== "org" && domain !== "net" && domain !== "jobs" && domain !== "careers") {
      company = domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }
  if (!company && document.title) {
    const parts = document.title.split(/[-|–—]/).map((p) => p.trim()).filter((p) => p);
    if (parts.length >= 2) {
      const firstPart = parts[0] ?? "";
      const lastPart = parts[parts.length - 1] ?? "";
      // Prefer the shorter part if one is much longer than the other
      if (firstPart.length < lastPart.length * 0.7) {
        company = firstPart;
      } else if (lastPart.length < firstPart.length * 0.7) {
        company = lastPart;
      } else {
        company = firstPart;
      }
    } else if (parts.length === 1) {
      company = parts[0] ?? "";
    }
  }

  // Clean up: if company is just a title, try to get it from domain
  if (company && company.toLowerCase() === title.toLowerCase() && host) {
    const domainParts = host.split(".");
    const domain = domainParts[domainParts.length - 2] ?? "";
    if (domain && domain !== "com" && domain !== "org" && domain !== "net" && domain !== "jobs" && domain !== "careers") {
      company = domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  return { url, title, company, jobDescription: jd, source };
}
