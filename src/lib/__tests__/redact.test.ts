// Tests for PII redaction round-trip and prompt PII safety (PRE-55).
//
// Covers:
//   1. redactResume / injectResume round-trip preserves all fields
//   2. Org name redaction / injection preserves all values
//   3. Prompt builders produce zero PII in output strings
//   4. Edge cases: empty contact, no orgs, Unicode names, international
//      phone formats

import { describe, expect, test } from "vitest";
import {
  redactResume,
  injectResume,
  redactContact,
  injectContact,
  redactOrgNames,
  injectOrgNames,
  collectOrgNames,
  type RedactionMap,
} from "../redact";
import type { Resume } from "../resume";
import { tailorUserPrompt, editUserPrompt } from "../prompts/user";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFullResume(overrides?: Partial<Resume>): Resume {
  return {
    contact: {
      name: "Jane Doe",
      phone: "+1 (555) 123-4567",
      email: "jane.doe@example.com",
      links: [
        { label: "GitHub", href: "https://github.com/jane" },
        { label: "LinkedIn", href: "https://linkedin.com/in/jane" },
      ],
    },
    sections: [
      {
        id: "experience",
        kind: "experience",
        title: "Experience",
        items: [
          {
            id: "exp-1",
            title: "Senior Engineer",
            org: "Acme Corp",
            location: "New York, NY",
            start: "2020",
            end: "Present",
            bullets: [
              { id: "b1", text: "Led team of 5 engineers" },
            ],
            tags: ["leadership", "backend"],
          },
          {
            id: "exp-2",
            title: "Junior Dev",
            org: "Startup LLC",
            location: "San Francisco, CA",
            start: "2018",
            end: "2020",
            bullets: [],
            tags: [],
          },
        ],
      },
      {
        id: "education",
        kind: "education",
        title: "Education",
        items: [
          {
            id: "edu-1",
            school: "MIT",
            degree: "BS Computer Science",
            location: "Boston, MA",
            start: "2014",
            end: "2018",
            bullets: [],
            tags: [],
          },
        ],
      },
      {
        id: "projects",
        kind: "projects",
        title: "Projects",
        items: [
          {
            id: "proj-1",
            name: "OpenSource Widget",
            stack: "TypeScript, React",
            start: "2022",
            end: "2023",
            bullets: [],
            tags: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function isEmptyContactResume(): Resume {
  return {
    contact: { name: "", phone: "", email: "", links: [] },
    sections: [],
  };
}

// ── 1. Round-trip tests ──────────────────────────────────────────────────

describe("redactResume / injectResume round-trip", () => {
  test("full resume round-trip preserves all fields", () => {
    const original = makeFullResume();
    const { redacted, map } = redactResume(original);
    const restored = injectResume(redacted, map);

    // Deep equality check
    expect(restored).toEqual(original);

    // Contact fields
    expect(restored.contact.name).toBe("Jane Doe");
    expect(restored.contact.phone).toBe("+1 (555) 123-4567");
    expect(restored.contact.email).toBe("jane.doe@example.com");
    expect(restored.contact.links).toHaveLength(2);
    expect(restored.contact.links[0]).toEqual({ label: "GitHub", href: "https://github.com/jane" });
    expect(restored.contact.links[1]).toEqual({ label: "LinkedIn", href: "https://linkedin.com/in/jane" });
  });

  test("redacted content has no real PII", () => {
    const original = makeFullResume();
    const { redacted } = redactResume(original);

    // Contact fields are placeholders
    expect(redacted.contact.name).toBe("[NAME]");
    expect(redacted.contact.phone).toBe("[PHONE]");
    expect(redacted.contact.email).toBe("[EMAIL]");
    expect(redacted.contact.links[0].label).toBe("[LINK-0]");
    expect(redacted.contact.links[0].href).toBe("[LINK-0]");
    expect(redacted.contact.links[1].label).toBe("[LINK-1]");
    expect(redacted.contact.links[1].href).toBe("[LINK-1]");

    // Org names are placeholders
    const expSection = redacted.sections.find((s) => s.kind === "experience")!;
    expect((expSection.items[0] as { org: string }).org).toBe("[ORG-0]");
    expect((expSection.items[1] as { org: string }).org).toBe("[ORG-1]");
  });

  test("redacted content string contains no raw PII substrings", () => {
    const original = makeFullResume();
    const { redacted } = redactResume(original);
    const str = JSON.stringify(redacted);

    // Must not contain raw PII values
    expect(str).not.toContain("Jane Doe");
    expect(str).not.toContain("555");
    expect(str).not.toContain("jane.doe@example.com");
    expect(str).not.toContain("github.com/jane");
    expect(str).not.toContain("Acme Corp");
    expect(str).not.toContain("Startup LLC");
    expect(str).not.toContain("MIT");
    expect(str).not.toContain("OpenSource Widget");
  });

  test("redaction map stores original values correctly", () => {
    const original = makeFullResume();
    const { map } = redactResume(original);

    expect(map.contact.name).toBe("Jane Doe");
    expect(map.contact.phone).toBe("+1 (555) 123-4567");
    expect(map.contact.email).toBe("jane.doe@example.com");
    expect(map.contact.links).toHaveLength(2);

    // Org order is deterministic (sections in order, items in order)
    expect(map.orgs).toEqual(["Acme Corp", "Startup LLC", "MIT", "OpenSource Widget"]);
  });

  test("injectResume is idempotent (double injection is safe)", () => {
    const original = makeFullResume();
    const { redacted, map } = redactResume(original);
    const once = injectResume(redacted, map);
    const twice = injectResume(once, map);

    // Injecting again into already-injected content is a no-op because there
    // are no [ORG-N] patterns left to match.
    expect(twice).toEqual(once);
  });
});

// ── 2. Contact-only redaction ────────────────────────────────────────────

describe("redactContact / injectContact", () => {
  test("round-trip preserves all contact fields", () => {
    const resume = makeFullResume();
    const { redacted, map } = redactContact(resume);
    const restored = injectContact(redacted, map);

    expect(restored.contact).toEqual(resume.contact);
  });

  test("org fields are NOT affected by contact redaction", () => {
    const resume = makeFullResume();
    const { redacted } = redactContact(resume);

    // Org names should still be real after contact-only redaction
    const expSection = redacted.sections.find((s) => s.kind === "experience")!;
    expect((expSection.items[0] as { org: string }).org).toBe("Acme Corp");
    expect((expSection.items[1] as { org: string }).org).toBe("Startup LLC");
  });
});

// ── 3. Org name redaction ────────────────────────────────────────────────

describe("redactOrgNames / injectOrgNames / collectOrgNames", () => {
  test("collectOrgNames returns unique deduplicated orgs in order", () => {
    const resume: Resume = {
      contact: { name: "", phone: "", email: "", links: [] },
      sections: [
        {
          id: "exp", kind: "experience", title: "Exp",
          items: [
            { id: "e1", title: "A", org: "Acme Corp", location: "", start: "", end: "", bullets: [], tags: [] },
            { id: "e2", title: "B", org: "Acme Corp", location: "", start: "", end: "", bullets: [], tags: [] },
            { id: "e3", title: "C", org: "Beta Inc", location: "", start: "", end: "", bullets: [], tags: [] },
          ],
        },
      ],
    };
    const orgs = collectOrgNames(resume);
    expect(orgs).toEqual(["Acme Corp", "Beta Inc"]);
  });

  test("collectOrgNames handles mixed section kinds", () => {
    const resume: Resume = {
      contact: { name: "", phone: "", email: "", links: [] },
      sections: [
        {
          id: "exp", kind: "experience", title: "Exp",
          items: [{ id: "e1", title: "A", org: "Company A", location: "", start: "", end: "", bullets: [], tags: [] }],
        },
        {
          id: "edu", kind: "education", title: "Edu",
          items: [{ id: "ed1", school: "University B", degree: "", location: "", start: "", end: "", bullets: [], tags: [] }],
        },
        {
          id: "proj", kind: "projects", title: "Proj",
          items: [{ id: "p1", name: "Project C", stack: "", start: "", end: "", bullets: [], tags: [] }],
        },
      ],
    };
    const orgs = collectOrgNames(resume);
    expect(orgs).toEqual(["Company A", "University B", "Project C"]);
  });

  test("org redaction + injection round-trip preserves all orgs", () => {
    const resume = makeFullResume();
    const { redacted, map } = redactOrgNames(resume);
    const restored = injectOrgNames(redacted, map);

    // All orgs restored
    expect(restored).toEqual(resume);
  });

  test("org redaction works with existing map from contact redaction", () => {
    const resume = makeFullResume();
    const step1 = redactContact(resume);
    const step2 = redactOrgNames(step1.redacted, step1.map);

    // Map should have both contact and org info
    expect(step2.map.contact.name).toBe("Jane Doe");
    expect(step2.map.orgs).toHaveLength(4);
  });
});

// ── 4. Edge cases ────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("empty contact fields are preserved", () => {
    const resume = isEmptyContactResume();
    const { redacted, map } = redactResume(resume);
    const restored = injectResume(redacted, map);

    expect(restored.contact.name).toBe("");
    expect(restored.contact.phone).toBe("");
    expect(restored.contact.email).toBe("");
    expect(restored.contact.links).toEqual([]);
  });

  test("no sections / no orgs", () => {
    const resume: Resume = {
      contact: { name: "Alice", phone: "123", email: "a@b.com", links: [] },
      sections: [],
    };
    const { redacted, map } = redactResume(resume);

    expect(map.orgs).toEqual([]);
    expect(redacted.sections).toEqual([]);
  });

  test("Unicode names are preserved in round-trip", () => {
    const resume: Resume = {
      contact: { name: "José María 李明", phone: "", email: "", links: [] },
      sections: [],
    };
    const { redacted, map } = redactResume(resume);
    const restored = injectResume(redacted, map);

    expect(restored.contact.name).toBe("José María 李明");
    // Redacted has placeholder
    expect(redacted.contact.name).toBe("[NAME]");
  });

  test("international phone formats are preserved", () => {
    const phones = [
      "+44 20 7946 0958",
      "+81 3-1234-5678",
      "+49 151 12345678",
      "+33 1 23 45 67 89",
      "044 123 45 67",   // Swiss
      "+61 2 1234 5678",  // Australian
    ];

    for (const phone of phones) {
      const resume: Resume = {
        contact: { name: "", phone, email: "", links: [] },
        sections: [],
      };
      const { redacted, map } = redactResume(resume);
      const restored = injectResume(redacted, map);

      expect(restored.contact.phone).toBe(phone);
      // Redacted has placeholder
      expect(redacted.contact.phone).toBe("[PHONE]");
    }
  });

  test("many links (10+) are indexed correctly", () => {
    const links = Array.from({ length: 15 }, (_, i) => ({
      label: `Link ${i}`,
      href: `https://example.com/${i}`,
    }));
    const resume: Resume = {
      contact: { name: "", phone: "", email: "", links },
      sections: [],
    };
    const { redacted, map } = redactResume(resume);
    const restored = injectResume(redacted, map);

    expect(restored.contact.links).toEqual(links);
    expect(map.contact.links).toEqual(links);

    // Verify placeholder indices
    expect(redacted.contact.links[0].label).toBe("[LINK-0]");
    expect(redacted.contact.links[14].label).toBe("[LINK-14]");
  });

  test("org names with special characters survive round-trip", () => {
    const orgs = [
      "AT&T",
      "Müller & Söhne GmbH",
      "IBM (International Business Machines)",
      'Company "Best" Ltd.',
    ];

    for (const org of orgs) {
      const resume: Resume = {
        contact: { name: "", phone: "", email: "", links: [] },
        sections: [{
          id: "exp", kind: "experience", title: "Exp",
          items: [{ id: "e1", title: "Role", org, location: "", start: "", end: "", bullets: [], tags: [] }],
        }],
      };
      const { redacted, map } = redactResume(resume);
      const restored = injectResume(redacted, map);

      const restoredOrg = (restored.sections[0].items[0] as { org: string }).org;
      expect(restoredOrg).toBe(org);
    }
  });
});

// ── 5. Prompt builder PII safety ─────────────────────────────────────────
// These tests verify that when route handlers pass redacted data to the
// prompt builders (PRE-52), the resulting prompts contain zero raw PII.
// Redaction happens at the route level (tailor/route.ts, edit/route.ts),
// not inside the prompt builders themselves.
describe("prompt builders produce zero PII with pre-redacted input", () => {
  test("tailorUserPrompt contains no raw contact PII when given redacted data", () => {
    const original = makeFullResume();
    // Simulate route-level redaction: routes call redactResume() before
    // passing data to prompt builders (PRE-52).
    const master = redactResume(original).redacted;
    const priorVersions = [
      {
        company: "Acme Corp",
        role: "Engineer",
        tailored_content: redactResume(makeFullResume()).redacted,
      },
    ];

    const prompt = tailorUserPrompt({
      master,
      priorVersions,
      jobDescription: "Looking for a senior engineer",
    });

    // Must not contain real PII in the serialized prompt
    expect(prompt).not.toContain("Jane Doe");
    expect(prompt).not.toContain("jane.doe@example.com");
    expect(prompt).not.toContain("555");
    expect(prompt).not.toContain("github.com/jane");
    expect(prompt).not.toContain("linkedin.com/in/jane");

    // Must contain placeholders instead
    expect(prompt).toContain("[NAME]");
    expect(prompt).toContain("[EMAIL]");
    expect(prompt).toContain("[PHONE]");
    expect(prompt).toContain("[LINK-0]");
    expect(prompt).toContain("[ORG-0]");
  });

  test("editUserPrompt contains no raw contact PII when given redacted data", () => {
    const original = makeFullResume();
    const master = redactResume(original).redacted;
    const current = redactResume(original).redacted;

    const prompt = editUserPrompt({
      master,
      current,
      instruction: "Make it more concise",
    });

    // Must not contain real PII
    expect(prompt).not.toContain("Jane Doe");
    expect(prompt).not.toContain("jane.doe@example.com");
    expect(prompt).not.toContain("555");
    expect(prompt).not.toContain("Acme Corp");

    // Must contain placeholders
    expect(prompt).toContain("[NAME]");
    expect(prompt).toContain("[EMAIL]");
    expect(prompt).toContain("[ORG-0]");
  });

  test("tailorUserPrompt redacts prior versions too when routes redact", () => {
    const master = redactResume(makeFullResume()).redacted;
    const priorVersionContent = {
      contact: { name: "Secret Agent", phone: "999", email: "secret@evil.com", links: [] },
      sections: [],
    };
    const priorVersions = [
      {
        company: "Evil Corp",
        role: "Hacker",
        tailored_content: redactResume(priorVersionContent).redacted,
      },
    ];

    const prompt = tailorUserPrompt({
      master,
      priorVersions,
      jobDescription: "Looking for a senior engineer",
    });

    // Must not contain PII from prior versions either
    expect(prompt).not.toContain("Secret Agent");
    expect(prompt).not.toContain("999");
    expect(prompt).not.toContain("secret@evil.com");
  });

  test("multiple redaction calls on the same resume are safe (prompt builder doesn't mutate input)", () => {
    const original = makeFullResume();
    const master = redactResume(original).redacted;

    // Call twice — the second call should still produce safe output
    const prompt1 = tailorUserPrompt({
      master,
      priorVersions: [],
      jobDescription: "JD 1",
    });
    const prompt2 = tailorUserPrompt({
      master,
      priorVersions: [],
      jobDescription: "JD 2",
    });

    // The original master should be untouched by the prompt builder
    expect(original.contact.name).toBe("Jane Doe");

    // Both prompts must be safe
    expect(prompt1).not.toContain("Jane Doe");
    expect(prompt2).not.toContain("Jane Doe");
  });
});
