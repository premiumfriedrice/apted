// Tests for the two-phase tailor pipeline (PRE-41).
//
// Covers:
//   1. FilterSpec schema validation (well-formed and malformed inputs)
//   2. applyFilter correctness — keeps/drops sections and items
//   3. applyFilter output always passes Resume.parse() (pipeline integrity)
//   4. Structure selection determinism — same input → same result
import { describe, it, expect } from "vitest";
import {
  FilterSpec,
  applyFilter,
  toSkeleton,
  buildStructureSystemPrompt,
  buildStructureUserPrompt,
} from "../structure";
import { Resume, emptyMaster } from "../resume";

// ── Test helpers ─────────────────────────────────────────────────────────

function sampleMaster() {
  const master = emptyMaster();
  master.contact = {
    name: "Jane Doe",
    phone: "555-0100",
    email: "jane@example.com",
    links: [],
  };
  // Experience section
  master.sections = [
    {
      id: "experience",
      kind: "experience" as const,
      title: "Experience",
      items: [
        {
          id: "exp-senior",
          title: "Senior Engineer",
          org: "Acme Corp",
          location: "SF, CA",
          start: "2023",
          end: "Present",
          bullets: [{ id: "b1", text: "Led frontend migration to React 18" }],
          notes: "",
          tags: ["react", "typescript", "frontend"],
        },
        {
          id: "exp-junior",
          title: "Junior Developer",
          org: "Startup Inc",
          location: "Austin, TX",
          start: "2020",
          end: "2023",
          bullets: [{ id: "b2", text: "Built CRUD APIs in Express" }],
          notes: "",
          tags: ["node", "express", "backend"],
        },
      ],
    },
    {
      id: "projects",
      kind: "projects" as const,
      title: "Projects",
      items: [
        {
          id: "proj-ml",
          name: "ML Pipeline",
          stack: "Python, PyTorch",
          start: "2023",
          end: "2023",
          bullets: [{ id: "b3", text: "Trained BERT classifier" }],
          notes: "",
          tags: ["ml", "python"],
        },
        {
          id: "proj-web",
          name: "Portfolio Site",
          stack: "Next.js, Tailwind",
          start: "2022",
          end: "2022",
          bullets: [{ id: "b4", text: "Responsive personal site" }],
          notes: "",
          tags: ["react", "frontend"],
        },
      ],
    },
    {
      id: "education",
      kind: "education" as const,
      title: "Education",
      items: [
        {
          id: "edu-cs",
          school: "State U",
          degree: "B.S. Computer Science",
          location: "",
          start: "2016",
          end: "2020",
          bullets: [],
          tags: [],
        },
      ],
    },
    {
      id: "achievements",
      kind: "achievements" as const,
      title: "Achievements",
      items: [
        { id: "ach-win", text: "1st Place - Hackathon 2024" },
        { id: "ach-paper", text: "Published paper on distributed systems" },
      ],
    },
    {
      id: "skills",
      kind: "skills" as const,
      title: "Technical Skills",
      items: [
        { id: "sk-lang", category: "Languages", items: "TypeScript, Python, Go" },
        { id: "sk-fw", category: "Frameworks", items: "React, Next.js, Express" },
      ],
    },
  ];
  return master;
}

// ── 1. FilterSpec schema validation ──────────────────────────────────────

describe("FilterSpec schema", () => {
  it("parses a valid filter spec with kept and dropped sections", () => {
    const spec = {
      sections: [
        { id: "experience", keep: true, items: [
          { id: "exp-senior", keep: true },
          { id: "exp-junior", keep: false },
        ]},
        { id: "projects", keep: true },
        { id: "education", keep: false },
      ],
    };
    const parsed = FilterSpec.parse(spec);
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0].keep).toBe(true);
    expect(parsed.sections[2].keep).toBe(false);
  });

  it("parses a spec with no per-item filtering (keep all items)", () => {
    const spec = {
      sections: [
        { id: "experience", keep: true },
        { id: "skills", keep: true },
      ],
    };
    const parsed = FilterSpec.parse(spec);
    expect(parsed.sections[0].items).toBeUndefined();
  });

  it("parses all items dropped in a kept section", () => {
    const spec = {
      sections: [
        { id: "experience", keep: true, items: [
          { id: "exp-senior", keep: false },
          { id: "exp-junior", keep: false },
        ]},
      ],
    };
    const parsed = FilterSpec.parse(spec);
    const items = parsed.sections[0].items!;
    expect(items.every((i) => !i.keep)).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(() => FilterSpec.parse({})).toThrow();
    expect(() => FilterSpec.parse({ sections: [{ keep: true }] })).toThrow(); // missing id
    expect(() => FilterSpec.parse({ sections: [{ id: "x" }] })).toThrow(); // missing keep
  });

  it("rejects wrong types", () => {
    expect(() => FilterSpec.parse({ sections: "not-an-array" })).toThrow();
    expect(() => FilterSpec.parse({ sections: [{ id: 123, keep: "yes" }] })).toThrow();
  });

  it("accepts extra unknown fields (passthrough is ok)", () => {
    // Zod's .parse() is strict by default, but we only define what we need.
    // Extra fields are silently dropped, which is fine for forward compat.
    const spec = { sections: [{ id: "x", keep: true, extra: "ignored" }] };
    const parsed = FilterSpec.parse(spec);
    expect(parsed.sections[0].keep).toBe(true);
  });
});

// ── 2. applyFilter correctness ───────────────────────────────────────────

describe("applyFilter", () => {
  it("keeps only sections marked keep: true", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "experience", keep: true },
        { id: "skills", keep: true },
      ],
    });
    const result = applyFilter(master, filter);
    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((s) => s.id)).toEqual(["experience", "skills"]);
  });

  it("drops entire sections when keep: false", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [{ id: "experience", keep: false }],
    });
    const result = applyFilter(master, filter);
    expect(result.sections.find((s) => s.id === "experience")).toBeUndefined();
  });

  it("filters items within a section", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "experience", keep: true, items: [
          { id: "exp-senior", keep: true },
          { id: "exp-junior", keep: false },
        ]},
      ],
    });
    const result = applyFilter(master, filter);
    const exp = result.sections.find((s) => s.id === "experience")!;
    expect(exp.items).toHaveLength(1);
    expect((exp.items[0] as { id: string }).id).toBe("exp-senior");
  });

  it("keeps all items when no per-item filter is provided", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [{ id: "experience", keep: true }],
    });
    const result = applyFilter(master, filter);
    const exp = result.sections.find((s) => s.id === "experience")!;
    expect(exp.items).toHaveLength(2); // both items kept
  });

  it("returns empty sections when all items are filtered out", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "experience", keep: true, items: [
          { id: "exp-senior", keep: false },
          { id: "exp-junior", keep: false },
        ]},
      ],
    });
    const result = applyFilter(master, filter);
    const exp = result.sections.find((s) => s.id === "experience")!;
    expect(exp.items).toHaveLength(0);
  });

  it("handles unknown section ids gracefully (no-op)", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [{ id: "nonexistent", keep: true }],
    });
    const result = applyFilter(master, filter);
    // All sections dropped because none matched "nonexistent"
    expect(result.sections).toHaveLength(0);
  });

  it("preserves contact info unchanged", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [{ id: "experience", keep: true }],
    });
    const result = applyFilter(master, filter);
    expect(result.contact).toEqual(master.contact);
  });

  it("filters across multiple section kinds (projects, education, achievements)", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "projects", keep: true, items: [
          { id: "proj-web", keep: true },
          { id: "proj-ml", keep: false },
        ]},
        { id: "education", keep: true }, // keep all
        { id: "achievements", keep: true, items: [
          { id: "ach-win", keep: true },
        ]},
        { id: "skills", keep: true, items: [
          { id: "sk-lang", keep: true },
        ]},
      ],
    });
    const result = applyFilter(master, filter);

    const proj = result.sections.find((s) => s.id === "projects")!;
    expect(proj.items).toHaveLength(1);
    expect((proj.items[0] as { id: string }).id).toBe("proj-web");

    const edu = result.sections.find((s) => s.id === "education")!;
    expect(edu.items).toHaveLength(1); // all kept

    const ach = result.sections.find((s) => s.id === "achievements")!;
    expect(ach.items).toHaveLength(1);

    const sk = result.sections.find((s) => s.id === "skills")!;
    expect(sk.items).toHaveLength(1);
  });
});

// ── 3. Pipeline integrity — applyFilter output passes Resume.parse ───────

describe("Pipeline integrity", () => {
  it("applyFilter output is always valid Resume JSON", () => {
    const master = sampleMaster();
    // Test many filter combinations
    const filters: FilterSpec[] = [
      // Keep all
      FilterSpec.parse({
        sections: master.sections.map((s) => ({ id: s.id, keep: true })),
      }),
      // Drop all
      FilterSpec.parse({
        sections: master.sections.map((s) => ({ id: s.id, keep: false })),
      }),
      // Keep experience only, filter one item
      FilterSpec.parse({
        sections: [
          { id: "experience", keep: true, items: [
            { id: "exp-senior", keep: true },
          ]},
        ],
      }),
      // Keep all sections, drop all items
      FilterSpec.parse({
        sections: master.sections.map((s) => ({
          id: s.id,
          keep: true,
          items: s.items.map((it: { id: string }) => ({
            id: it.id,
            keep: false,
          })),
        })),
      }),
      // Empty filter
      FilterSpec.parse({ sections: [] }),
    ];

    for (const filter of filters) {
      const result = applyFilter(master, filter);
      // Should never throw
      const parsed = Resume.parse(result);
      expect(parsed).toBeDefined();
      expect(Array.isArray(parsed.sections)).toBe(true);
    }
  });

  it("filtered sections still have correct kind field", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "experience", keep: true },
        { id: "projects", keep: true },
      ],
    });
    const result = applyFilter(master, filter);
    for (const sec of result.sections) {
      expect(["experience", "projects"]).toContain(sec.kind);
    }
  });

  it("filtered items retain all their fields (bullets, tags, etc.)", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "experience", keep: true, items: [
          { id: "exp-senior", keep: true },
        ]},
      ],
    });
    const result = applyFilter(master, filter);
    const item = result.sections[0].items[0] as {
      id: string; title: string; org: string; bullets: Array<{ text: string }>; tags: string[];
    };
    expect(item.id).toBe("exp-senior");
    expect(item.title).toBe("Senior Engineer");
    expect(item.org).toBe("Acme Corp");
    expect(item.bullets).toHaveLength(1);
    expect(item.tags).toContain("react");
  });
});

// ── 4. Determinism ───────────────────────────────────────────────────────

describe("Determinism", () => {
  it("applyFilter is deterministic — same input → same output", () => {
    const master = sampleMaster();
    const filter = FilterSpec.parse({
      sections: [
        { id: "experience", keep: true, items: [
          { id: "exp-senior", keep: true },
          { id: "exp-junior", keep: false },
        ]},
        { id: "projects", keep: true, items: [
          { id: "proj-web", keep: true },
        ]},
        { id: "education", keep: true },
        { id: "achievements", keep: false },
        { id: "skills", keep: false },
      ],
    });

    const first = applyFilter(master, filter);
    const second = applyFilter(master, filter);
    expect(first).toEqual(second);
  });

  it("toSkeleton is deterministic", () => {
    const master = sampleMaster();
    const s1 = toSkeleton(master);
    const s2 = toSkeleton(master);
    expect(s1).toEqual(s2);
  });

  it("toSkeleton produces expected structure", () => {
    const master = sampleMaster();
    const skeleton = toSkeleton(master);
    expect(skeleton).toHaveLength(5); // 5 sections

    const exp = skeleton.find((s) => s.id === "experience")!;
    expect(exp.items).toHaveLength(2);
    expect(exp.items[0].label).toContain("Senior Engineer");
    expect(exp.items[0].label).toContain("Acme Corp");
    expect(exp.items[0].tags).toContain("react");

    const proj = skeleton.find((s) => s.id === "projects")!;
    expect(proj.items[0].label).toContain("ML Pipeline");
    expect(proj.items[0].label).toContain("Python, PyTorch");
  });
});

// ── 5. Structure prompt integrity ────────────────────────────────────────

describe("Structure prompts", () => {
  it("system prompt is non-empty and mentions expected keywords", () => {
    const prompt = buildStructureSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("structure-selection");
    expect(prompt).toContain("exact shape");
    expect(prompt).toContain("\"sections\"");
  });

  it("user prompt includes JD and skeleton", () => {
    const skeleton = toSkeleton(sampleMaster());
    const prompt = buildStructureUserPrompt({
      jobDescription: "Senior Frontend Engineer",
      skeleton,
    });
    expect(prompt).toContain("Senior Frontend Engineer");
    expect(prompt).toContain("experience");
    expect(prompt).toContain("Senior Engineer");
  });
});
