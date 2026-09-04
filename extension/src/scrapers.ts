// scrapeJob runs in the active tab's page context via chrome.scripting.executeScript({ func }).
// It MUST be self-contained — no module-level identifiers from the bundle survive serialization.

import type { ScrapedJob } from "./types";

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
  let jd = "";
  let title = "";
  let company = "";

  // ── Site-specific JD extraction ──────────────────────────────────────────
  // JD text comes from DOM selectors. Title/company come from cheap DOM
  // heuristics as a FALLBACK when the LLM extract endpoint is unavailable —
  // the LLM values are still preferred and overwrite these when they succeed.

  if (host.endsWith("linkedin.com")) {
    source = "linkedin";
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
    title = norm(
      firstMatch([
        ".job-details-jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title h1",
        "h1",
      ]),
    );
    company = norm(
      firstMatch([
        ".job-details-jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__primary-description a",
      ]),
    );
  } else if (host.endsWith("greenhouse.io")) {
    source = "greenhouse";
    jd = blockText(
      firstMatch(["#content", ".content", "#app_body", "[data-testid='job-description']", "main"]),
    );
    title = norm(firstMatch(["h1.app-title", "h1"]));
    company = norm(firstMatch([".company-name", ".header-brand a", "[data-testid='company-name']"])).replace(/^at\s+/i, "");
    if (!company) {
      const parts = document.title.split(/[-–—|]/);
      const last = parts[parts.length - 1]?.trim();
      if (last) company = last;
    }
  } else if (host.endsWith("lever.co")) {
    source = "lever";
    jd = blockText(
      firstMatch([
        ".section-wrapper.page-full-width",
        ".section.page-centered",
        ".posting",
        "[data-qa='job-description']",
        "main",
      ]),
    );
    title = norm(firstMatch([".posting-headline h2", ".posting-headline h1", "h2", "h1"]));
    company =
      norm(firstMatch([".main-header-text", ".main-header a", ".logo a"])) ||
      (location.pathname.split("/").filter(Boolean)[0] || "");
  } else if (host.endsWith("myworkdayjobs.com") || host.endsWith("workday.com")) {
    source = "workday";
    jd = blockText(
      firstMatch([
        "[data-automation-id='jobPostingDescription']",
        "[data-automation-id='postingDescription']",
        "[data-automation-id='description']",
        "[data-testid='job-description']",
      ]),
    );
    title = norm(
      firstMatch([
        "[data-automation-id='jobPostingHeader']",
        "h2[data-automation-id='jobPostingHeader']",
        "h1[data-automation-id='jobPostingHeader']",
        "h1",
      ]),
    );
    const sub = host.split(".")[0] ?? "";
    const GENERIC_SUBDOMAINS = new Set(["www", "jobs", "careers", "workday", "myworkdayjobs", "wd102", "wd1", "wd2", "wd3"]);
    company = sub && !GENERIC_SUBDOMAINS.has(sub) ? sub.charAt(0).toUpperCase() + sub.slice(1) : "";
    if (!company && document.title) {
      const m = document.title.match(/at\s+([^-|]+)/i);
      if (m) company = m[1]?.trim() ?? "";
    }
  } else if (host.endsWith("ashbyhq.com")) {
    source = "ashby";
    jd = blockText(
      firstMatch([
        "[data-testid='job-description']",
        "[data-testid='description']",
        "[data-qa='job-description']",
        "main",
        "article",
      ]),
    );
    title = norm(firstMatch(["h1[data-testid='job-title']", "h1"]));
    // Ashby URLs: https://jobs.ashbyhq.com/company-name/job-id
    const pathParts = (location.pathname ?? "").split("/").filter(Boolean);
    const rawSlug = pathParts[0] ?? "";
    company = rawSlug
      ? rawSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    if (!company) {
      company = norm(firstMatch(["[data-testid='company-name']", "a[href^='/jobs']", "header a"]));
    }
  }

  // ── Generic fallback: pick the densest text block ───────────────────────
  if (!jd) {
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

  return { url, title, company, jobDescription: jd, source };
}