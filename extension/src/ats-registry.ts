// ATS registry: config-driven capture for the supported job boards.
//
// The JSON file is the single source of truth for per-ATS URL patterns,
// tracked-object identity templates, DOM extraction selectors, confirmation
// selectors, and submit/continue button labels. scrapers.ts and
// submit-detection.ts consume it; the tracker drawer (tracker-drawer.ts)
// drives the capture flow on top.

import registryJson from "./ats-registry.json";

export type AtsKey = "greenhouse" | "lever" | "workday" | "ashby" | "linkedin";

export type AtsEntry = {
  name: string;
  /** Chrome-style match patterns ("https://host/path" with * wildcards). */
  urlPatterns: string[];
  /** Stable per-ATS identity template, e.g. "greenhouse:{{company}}/{{reqId}}". */
  trackedObjTemplate: string;
  /** Template vars resolved from positional path segments (0-based, decoded). */
  trackedObjPath?: Record<string, number>;
  /** Template vars resolved from regex captures on the full URL (group 1). */
  trackedObjRegex?: Record<string, string>;
  /** Template vars resolved from the host's leftmost subdomain label. */
  trackedObjSubdomain?: string[];
  jdSelectors: string[];
  roleSelectors: string[];
  companySelectors: string[];
  /** Positional path segment used as the company name (titlecased). */
  companyPathSegment?: number;
  /** Host-subdomain company extraction, skipping these generic labels. */
  companySubdomainStoplist?: string[];
  /** Confirmation DOM selectors — a visible match means "submitted". */
  successSelectors: string[];
  /** Lowercase labels identifying the FINAL submit control. */
  submitLabels: string[];
  /** Lowercase labels of mid-flow controls (never a submission). */
  continueLabels: string[];
};

export type AtsRegistry = Record<AtsKey, AtsEntry>;

export const ATS_REGISTRY = registryJson as AtsRegistry;

/** Match one URL against a "https://host/path" wildcard pattern. */
export function matchesPattern(pattern: string, url: string): boolean {
  const m = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/);
  if (!m) return false;
  const scheme = m[1] ?? "";
  const hostPat = (m[2] ?? "*").toLowerCase();
  const pathPat = m[3] ?? "/*";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (scheme !== "*" && u.protocol.replace(":", "") !== scheme) return false;

  // Host: "*" or exact, or "*.domain" suffix match (dot boundary).
  if (hostPat !== "*") {
    const host = u.hostname.toLowerCase();
    const pat = hostPat.toLowerCase();
    if (pat.startsWith("*.")) {
      const suffix = pat.slice(1); // ".domain"
      if (!(host.endsWith(suffix) || host === pat.slice(2))) return false;
    } else if (host !== pat) {
      return false;
    }
  }

  // Path: "*" matches any sequence (including "/").
  const pathRe =
    "^" + pathPat.split("*").map(escapeRe).join(".*") + "$";
  return new RegExp(pathRe).test(u.pathname + u.search);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type AtsMatch = { key: AtsKey; entry: AtsEntry };

/** Resolve the registry entry for a URL, or null when unsupported. */
export function matchAts(url: string): AtsMatch | null {
  for (const key of Object.keys(ATS_REGISTRY) as AtsKey[]) {
    const entry = ATS_REGISTRY[key];
    if (entry.urlPatterns.some((p) => matchesPattern(p, url))) {
      return { key, entry };
    }
  }
  return null;
}

function titlecaseSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build the stable per-ATS identity ("trackedObj") for a URL, e.g.
 * `greenhouse:stripe/4021853`. Returns null when a template var can't be
 * resolved (e.g. a non-job URL on a job-board host).
 */
export function buildTrackedObj(url: string): string | null {
  const match = matchAts(url);
  if (!match) return null;
  const { entry } = match;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const segments = u.pathname.split("/").filter(Boolean);

  const vars: Record<string, string> = {};
  if (entry.trackedObjPath) {
    for (const [name, idx] of Object.entries(entry.trackedObjPath)) {
      const seg = segments[idx];
      if (seg === undefined) return null;
      vars[name] = decodeURIComponent(seg);
    }
  }
  if (entry.trackedObjSubdomain) {
    const sub = u.hostname.split(".")[0] ?? "";
    if (!sub) return null;
    if (entry.companySubdomainStoplist?.includes(sub.toLowerCase())) return null;
    for (const name of entry.trackedObjSubdomain) vars[name] = sub;
  }
  if (entry.trackedObjRegex) {
    for (const [name, re] of Object.entries(entry.trackedObjRegex)) {
      const m = url.match(new RegExp(re, "i"));
      if (!m || !m[1]) return null;
      vars[name] = m[1];
    }
  }

  const resolved = entry.trackedObjTemplate.replace(/\{\{(\w+)\}\}/g, (_all, name: string) => {
    const v = vars[name];
    return v !== undefined ? v : "";
  });
  // A missing var leaves "{{"→"" gaps; require at least one resolved var and
  // no unresolved placeholders to emit an id.
  if (!/\{\{/.test(resolved) && /:/.test(resolved) && resolved.split(/[:/]/).every(Boolean)) {
    return resolved;
  }
  return null;
}

/** Extract company/role from the registry selectors, given a document root. */
export function extractFieldsFromDoc(
  entry: AtsEntry,
  doc: Document | ParentNode,
  url: string,
): { company: string; role: string } {
  const norm = (el: Element | null | undefined): string =>
    (el?.textContent ?? "").replace(/\s+/g, " ").trim();

  const firstMatch = (sels: string[]): Element | null => {
    for (const s of sels) {
      try {
        const el = doc.querySelector(s);
        if (el && (el.textContent ?? "").trim()) return el;
      } catch {
        /* invalid selector — skip */
      }
    }
    return null;
  };

  let company = norm(firstMatch(entry.companySelectors)).replace(/^at\s+/i, "");
  let role = norm(firstMatch(entry.roleSelectors));

  if (!company && entry.companyPathSegment !== undefined) {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[entry.companyPathSegment];
    if (seg) company = titlecaseSlug(seg);
  }
  if (!company && entry.companySubdomainStoplist) {
    const sub = new URL(url).hostname.split(".")[0] ?? "";
    if (sub && !entry.companySubdomainStoplist.includes(sub.toLowerCase())) {
      company = sub.charAt(0).toUpperCase() + sub.slice(1);
    }
  }
  return { company, role };
}
