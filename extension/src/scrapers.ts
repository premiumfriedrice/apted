// scrapeJob runs in the active tab's page context via chrome.scripting.executeScript({ func }).
// It MUST be self-contained — no module-level identifiers from the bundle survive serialization.
//
// Company and title extraction is handled by the LLM via /api/extract.
// The DOM scraper only extracts the job description text and identifies the source site.

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

  // ── Site-specific JD extraction ──────────────────────────────────────────
  // Each site knows where its JD content lives. Title and company are left
  // empty — the LLM /api/extract endpoint fills them from the JD text.

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
  } else if (host.endsWith("greenhouse.io")) {
    source = "greenhouse";
    jd = blockText(
      firstMatch(["#content", ".content", "#app_body", "[data-testid='job-description']", "main"]),
    );
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
  }

  // Title and company are intentionally left empty — the LLM extract
  // endpoint fills them from the JD text for all sites.
  return { url, title: "", company: "", jobDescription: jd, source };
}