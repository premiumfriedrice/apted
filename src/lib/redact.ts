// PII Redaction module for apted.
//
// Two-pass redaction: contact info (name, phone, email, links) and
// organization names (company, school, project name). Each pass produces
// a redacted resume and a RedactionMap that can reverse the redaction.
//
// Placeholders:
//   [NAME], [PHONE], [EMAIL], [LINK-0], [LINK-1], ...
//   [ORG-0], [ORG-1], ...
//
// Thread-safe: these functions are pure — they clone input and return new
// objects. The caller wires the map into storage/retrieval.

import type { Resume, Section } from "./resume";

// ── Types ────────────────────────────────────────────────────────────────

export interface RedactionMap {
  contact: {
    name: string;
    phone: string;
    email: string;
    links: Array<{ label: string; href: string }>;
  };
  orgs: string[];
}

// ── Deep clone helper ────────────────────────────────────────────────────

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ── Contact redaction ────────────────────────────────────────────────────

/**
 * Redact contact PII from a resume. Returns the redacted resume and a
 * RedactionMap that can reverse the redaction via injectContact().
 *
 * Empty/undefined values are preserved as-is (the map still stores them).
 */
export function redactContact(
  resume: Resume,
): { redacted: Resume; map: RedactionMap } {
  const { contact } = resume;

  const map: RedactionMap = {
    contact: {
      name: contact.name ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      links: (contact.links ?? []).map((l) => ({
        label: l.label ?? "",
        href: l.href ?? "",
      })),
    },
    orgs: [],
  };

  const redacted: Resume = {
    ...clone(resume),
    contact: {
      name: contact.name ? "[NAME]" : contact.name ?? "",
      phone: contact.phone ? "[PHONE]" : contact.phone ?? "",
      email: contact.email ? "[EMAIL]" : contact.email ?? "",
      links: (contact.links ?? []).map((_l, i) => ({
        label: `[LINK-${i}]`,
        href: `[LINK-${i}]`,
      })),
    },
  };

  return { redacted, map };
}

/**
 * Inject contact PII back into a redacted resume using the RedactionMap
 * produced by redactContact(). Mutates nothing — returns a new object.
 */
export function injectContact(
  redacted: Resume,
  map: RedactionMap,
): Resume {
  const out = clone(redacted);
  out.contact = {
    name: map.contact.name,
    phone: map.contact.phone,
    email: map.contact.email,
    links: map.contact.links.map((l) => ({ label: l.label, href: l.href })),
  };
  return out;
}

// ── Organization name redaction ──────────────────────────────────────────

/**
 * Collect every organization name in the resume (company, school, project
 * name). Returns a deduplicated ordered list. Order is deterministic:
 * sections in array order, then items in array order.
 */
export function collectOrgNames(resume: Resume): string[] {
  const seen = new Set<string>();
  const orgs: string[] = [];

  for (const section of resume.sections ?? []) {
    for (const item of section.items ?? []) {
      let name: string | undefined;
      if ("org" in item && item.org) name = item.org;
      else if ("school" in item && item.school) name = item.school;
      else if ("name" in item && item.name) name = item.name;

      if (name && !seen.has(name)) {
        seen.add(name);
        orgs.push(name);
      }
    }
  }

  return orgs;
}

/**
 * Replace every org name in the resume with [ORG-N] placeholders.
 * Appends to an existing RedactionMap (from redactContact) or starts fresh.
 *
 * Returns the redacted resume and the updated map.
 */
export function redactOrgNames(
  resume: Resume,
  existingMap?: RedactionMap,
): { redacted: Resume; map: RedactionMap } {
  const orgs = collectOrgNames(resume);
  const redacted = clone(resume);

  // Build lookup: original name → placeholder
  const toPlaceholder = new Map<string, string>();
  for (let i = 0; i < orgs.length; i++) {
    toPlaceholder.set(orgs[i], `[ORG-${i}]`);
  }

  // Walk sections and replace
  for (const section of redacted.sections ?? []) {
    for (const item of section.items ?? []) {
      if ("org" in item && item.org && toPlaceholder.has(item.org)) {
        item.org = toPlaceholder.get(item.org)!;
      }
      if ("school" in item && item.school && toPlaceholder.has(item.school)) {
        item.school = toPlaceholder.get(item.school)!;
      }
      if ("name" in item && item.name && toPlaceholder.has(item.name)) {
        item.name = toPlaceholder.get(item.name)!;
      }
    }
  }

  const map: RedactionMap = existingMap
    ? { ...existingMap, orgs }
    : { contact: { name: "", phone: "", email: "", links: [] }, orgs };

  return { redacted, map };
}

/**
 * Inject org names back into a redacted resume using the RedactionMap.
 * Mutates nothing — returns a new object.
 */
export function injectOrgNames(
  redacted: Resume,
  map: RedactionMap,
): Resume {
  const out = clone(redacted);
  const orgs = map.orgs;

  for (const section of out.sections ?? []) {
    for (const item of section.items ?? []) {
      if ("org" in item && item.org) {
        const m = item.org.match(/^\[ORG-(\d+)\]$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          if (idx < orgs.length) item.org = orgs[idx];
        }
      }
      if ("school" in item && item.school) {
        const m = item.school.match(/^\[ORG-(\d+)\]$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          if (idx < orgs.length) item.school = orgs[idx];
        }
      }
      if ("name" in item && item.name) {
        const m = item.name.match(/^\[ORG-(\d+)\]$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          if (idx < orgs.length) item.name = orgs[idx];
        }
      }
    }
  }

  return out;
}

// ── Combined operations ──────────────────────────────────────────────────

/**
 * Full redaction: contact PII + org names in one pass.
 * Use this for the LLM prompt boundary and DB storage.
 */
export function redactResume(
  resume: Resume,
): { redacted: Resume; map: RedactionMap } {
  const step1 = redactContact(resume);
  const step2 = redactOrgNames(step1.redacted, step1.map);
  return step2;
}

/**
 * Full injection: restore contact PII + org names in one pass.
 * Use this for rendering (PDF, .tex, display).
 */
export function injectResume(
  redacted: Resume,
  map: RedactionMap,
): Resume {
  const step1 = injectContact(redacted, map);
  const step2 = injectOrgNames(step1, map);
  return step2;
}
