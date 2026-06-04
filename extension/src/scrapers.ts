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
  let title = "";
  let company = "";
  let jd = "";

  if (host.endsWith("linkedin.com")) {
    source = "linkedin";
    title = norm(
      firstMatch([
        ".job-details-jobs-unified-top-card__job-title",
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
      ]),
    );
    jd = blockText(
      firstMatch([
        ".jobs-description__content .jobs-description-content__text",
        "#job-details",
        ".jobs-description__container",
        ".jobs-box__html-content",
      ]),
    );
  } else if (host.endsWith("greenhouse.io")) {
    source = "greenhouse";
    title = norm(firstMatch([".app-title", "h1.app-title", "h1"]));
    company = norm(firstMatch([".company-name"])).replace(/^at\s+/i, "");
    jd = blockText(
      firstMatch(["#content", ".content", "#app_body", "main"]),
    );
  } else if (host.endsWith("lever.co")) {
    source = "lever";
    title = norm(firstMatch([".posting-headline h2", ".posting-headline", "h2"]));
    company =
      norm(firstMatch([".main-header-text", ".main-header a"])) ||
      location.pathname.split("/").filter(Boolean)[0] ||
      "";
    jd = blockText(
      firstMatch([
        ".section-wrapper.page-full-width",
        ".section.page-centered",
        ".posting",
        "main",
      ]),
    );
  } else if (host.endsWith("myworkdayjobs.com") || host.endsWith("workday.com")) {
    source = "workday";
    title = norm(
      firstMatch([
        "[data-automation-id='jobPostingHeader']",
        "h2[data-automation-id]",
        "h1",
      ]),
    );
    const sub = host.split(".")[0] ?? "";
    company = sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : "";
    jd = blockText(
      firstMatch([
        "[data-automation-id='jobPostingDescription']",
        "[data-automation-id='postingDescription']",
      ]),
    );
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
      company =
        norm(document.querySelector("meta[property='og:site_name']")) ||
        (document.title.split(/[-|–]/).pop() ?? "").trim();
    }
  }

  return { url, title, company, jobDescription: jd, source };
}
