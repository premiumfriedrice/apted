// scrapeJob runs in a page context (either bundled into a content script or
// serialized by chrome.scripting.executeScript({ func, args }) — the registry
// is passed as an ARG so the function body stays fully self-contained: no
// module-level identifiers survive func serialization.
//
// Per-site extraction (JD / role / company selectors) is driven by the ATS
// registry (ats-registry.json); anything unmatched falls through to the
// generic largest-text-block extractor.

import { ATS_REGISTRY } from "./ats-registry";
import type { AtsEntry, AtsRegistry } from "./ats-registry";
import type { ScrapedJob } from "./types";

export function scrapeJob(registry: AtsRegistry): ScrapedJob {
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
      .replace(/[ \t ]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const firstMatch = (sels: string[]): Element | null => {
    for (const s of sels) {
      let el: Element | null = null;
      try {
        el = document.querySelector(s);
      } catch {
        continue; // invalid selector in the registry — skip it
      }
      if (el && (el.textContent ?? "").trim()) return el;
    }
    return null;
  };

  // Minimal matcher for the registry's "https://host/path" wildcard patterns.
  // Kept inline (not imported) so scrapeJob survives func serialization.
  const matchesPattern = (pattern: string, u: string): boolean => {
    const pm = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/);
    if (!pm) return false;
    const scheme = pm[1] ?? "";
    const hostPat = (pm[2] ?? "").toLowerCase();
    const pathPat = pm[3] ?? "/*";
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return false;
    }
    if (scheme !== "*" && parsed.protocol.replace(":", "") !== scheme) return false;
    const h = parsed.hostname.toLowerCase();
    if (hostPat !== "*") {
      if (hostPat.startsWith("*.")) {
        const suffix = hostPat.slice(1);
        if (!(h.endsWith(suffix) || h === hostPat.slice(2))) return false;
      } else if (h !== hostPat) {
        return false;
      }
    }
    const pathRe = "^" + pathPat.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$";
    return new RegExp(pathRe).test(parsed.pathname + parsed.search);
  };

  const matchEntry = (u: string): AtsEntry | null => {
    for (const key of Object.keys(registry) as (keyof AtsRegistry)[]) {
      const e = registry[key];
      if (e && e.urlPatterns.some((p) => matchesPattern(p, u))) return e;
    }
    return null;
  };

  let source: ScrapedJob["source"] = "generic";
  let jd = "";
  let title = "";
  let company = "";

  const entry = matchEntry(url);
  if (entry) {
    source = host.endsWith("linkedin.com")
      ? "linkedin"
      : host.includes("greenhouse")
        ? "greenhouse"
        : host.endsWith("lever.co")
          ? "lever"
          : host.includes("myworkdayjobs") || host.includes("workday")
            ? "workday"
            : host.endsWith("ashbyhq.com")
              ? "ashby"
              : "generic";
    jd = blockText(firstMatch(entry.jdSelectors));
    title = norm(firstMatch(entry.roleSelectors));
    company = norm(firstMatch(entry.companySelectors)).replace(/^at\s+/i, "");

    // Registry-driven company fallbacks.
    if (!company && entry.companyPathSegment !== undefined) {
      const seg = location.pathname.split("/").filter(Boolean)[entry.companyPathSegment];
      if (seg) {
        company = decodeURIComponent(seg)
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    if (!company && entry.companySubdomainStoplist) {
      const sub = host.split(".")[0] ?? "";
      if (sub && !entry.companySubdomainStoplist.includes(sub.toLowerCase())) {
        company = sub.charAt(0).toUpperCase() + sub.slice(1);
      }
    }
    // Doc-title fallback: "... — Company" / "Company | Careers" tails.
    if (!company && document.title) {
      const parts = document.title.split(/[-–—|]/);
      const last = parts[parts.length - 1]?.trim();
      if (last && parts.length > 1) company = last;
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

// Bundled (content-script) wrapper: same scrape, registry injected directly.
// NOT safe for executeScript({ func }) — use scrapeJob + args there.
export function scrapeCurrentPage(): ScrapedJob {
  return scrapeJob(ATS_REGISTRY);
}
