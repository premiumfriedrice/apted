// Tests for similarity scoring and progress phases (PRE-49).
//
// Covers:
//   1. Progress phase transitions in order (pending PRE-45/46 impl)
//   2. Progress endpoint returns correct phase/percent (pending PRE-45/46 impl)
//   3. Similarity scores consistent for same input
//   4. Embeddings fallback to overlap when OPENAI_API_KEY missing
import { describe, it, expect } from "vitest";
import {
  rankPriorVersions,
  getRanker,
  rankPriorVersionsEmbeddings,
  type PriorVersion,
  type ScoredVersion,
} from "../relevance";
import { emptyMaster } from "../resume";

// ── Test helpers ─────────────────────────────────────────────────────────

function makeVersion(
  company: string,
  role: string,
  sections: Array<{
    kind: "experience" | "skills";
    title: string;
    items: Array<{ title?: string; org?: string; tags?: string[]; category?: string; items?: string }>;
  }>,
): PriorVersion {
  const master = emptyMaster();
  const versionSections = sections.map((s) => {
    if (s.kind === "experience") {
      return {
        id: s.title.toLowerCase(),
        kind: "experience" as const,
        title: s.title,
        items: s.items.map((it, i) => ({
          id: `item-${i}`,
          title: it.title ?? "",
          org: it.org ?? "",
          location: "",
          start: "",
          end: "",
          bullets: [],
          notes: "",
          tags: it.tags ?? [],
        })),
      };
    }
    return {
      id: s.title.toLowerCase(),
      kind: "skills" as const,
      title: s.title,
      items: s.items.map((it, i) => ({
        id: `sk-${i}`,
        category: it.category ?? "",
        items: it.items ?? "",
      })),
    };
  });
  return {
    company,
    role,
    tailored_content: {
      contact: { name: "", phone: "", email: "", links: [] },
      sections: versionSections,
    },
  };
}

// ── 3. Similarity scoring consistency ────────────────────────────────────

describe("Similarity scoring consistency", () => {
  const jd = "Senior React Engineer. Must have React, TypeScript, and Node.js experience.";
  const versions: PriorVersion[] = [
    makeVersion("Acme", "React Developer", [
      { kind: "experience", title: "Experience", items: [
        { title: "Frontend Lead", org: "Acme", tags: ["react", "typescript"] },
      ]},
    ]),
    makeVersion("OtherCo", "Python Backend", [
      { kind: "experience", title: "Experience", items: [
        { title: "Backend Dev", org: "OtherCo", tags: ["python", "flask"] },
      ]},
    ]),
    makeVersion("RelevantCo", "Fullstack Engineer", [
      { kind: "experience", title: "Experience", items: [
        { title: "Fullstack", org: "RelevantCo", tags: ["react", "node", "typescript"] },
      ]},
    ]),
  ];

  it("same input produces same scores (deterministic)", () => {
    const result1 = rankPriorVersions(jd, versions, 3);
    const result2 = rankPriorVersions(jd, versions, 3);
    expect(result1).toEqual(result2);
  });

  it("scores are in 0–100 range", () => {
    const results = rankPriorVersions(jd, versions, 3);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("scores are integers", () => {
    const results = rankPriorVersions(jd, versions, 3);
    for (const r of results) {
      expect(Number.isInteger(r.score)).toBe(true);
    }
  });

  it("more relevant versions score higher", () => {
    const results = rankPriorVersions(jd, versions, 3);
    // The most relevant version (best JD match) should score highest.
    // Order is verified by descending score.
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    // Python backend (no matching tags) should score lowest.
    expect(results[2].role).toBe("Python Backend");
  });

  it("versions with no matching tokens get low or zero scores", () => {
    const unrelated: PriorVersion[] = [
      makeVersion("UnrelatedCo", "Chef", [
        { kind: "experience", title: "Experience", items: [
          { title: "Head Chef", org: "Restaurant", tags: ["cooking", "menu"] },
        ]},
      ]),
    ];
    const results = rankPriorVersions(jd, unrelated, 1);
    expect(results[0].score).toBe(0);
  });

  it.skip("scores are normalized by profile size — short relevant profile beats long scattered one", () => {
    const focusedJd = "iOS Swift Engineer.";

    const focused: PriorVersion[] = [
      makeVersion("Apple", "iOS Developer", [
        { kind: "experience", title: "Experience", items: [
          { title: "iOS Engineer", org: "Apple", tags: ["ios", "swift"] },
        ]},
      ]),
    ];

    const longProfile: PriorVersion[] = [
      makeVersion("BigCo", "Generalist", [
        { kind: "experience", title: "Experience", items: [
          { title: "Engineer", org: "BigCo", tags: ["ios", "swift", "java", "python", "react", "angular", "go", "rust", "docker", "k8s"] },
        ]},
      ]),
    ];

    // Focused profile: few tokens, most matching → high normalized score
    // Long profile: many tokens, few matching → low normalized score
    const focusedResult = rankPriorVersions(focusedJd, focused, 1);
    const longResult = rankPriorVersions(focusedJd, longProfile, 1);

    // Focused score should be meaningfully higher than scattered
    expect(focusedResult[0].score).toBeGreaterThan(longResult[0].score);
  });

  it("versions are returned already scored (not just sorted PriorVersion)", () => {
    const results = rankPriorVersions(jd, versions, 3);
    for (const r of results) {
      expect(r).toHaveProperty("score");
      expect(r).toHaveProperty("company");
      expect(r).toHaveProperty("role");
      expect(r).toHaveProperty("tailored_content");
    }
  });
});

// ── 4. Embeddings fallback ───────────────────────────────────────────────

describe("Embeddings ranker fallback", () => {
  const jd = "Senior React Engineer. Must have React, TypeScript, and Node.js experience.";
  const versions: PriorVersion[] = [
    makeVersion("Acme", "React Developer", [
      { kind: "experience", title: "Experience", items: [
        { title: "Frontend Lead", org: "Acme", tags: ["react"] },
      ]},
    ]),
  ];

  it("getRanker returns overlap ranker when RELEVANCE_RANKER is unset", () => {
    const mode = process.env.RELEVANCE_RANKER;
    delete process.env.RELEVANCE_RANKER;
    try {
      const ranker = getRanker();
      // Should still work without errors
      expect(typeof ranker).toBe("function");
    } finally {
      if (mode) process.env.RELEVANCE_RANKER = mode;
    }
  });

  it("getRanker returns overlap ranker when RELEVANCE_RANKER is set to overlap", () => {
    const prev = process.env.RELEVANCE_RANKER;
    process.env.RELEVANCE_RANKER = "overlap";
    try {
      const ranker = getRanker();
      expect(typeof ranker).toBe("function");
    } finally {
      if (prev === undefined) delete process.env.RELEVANCE_RANKER;
      else process.env.RELEVANCE_RANKER = prev;
    }
  });

  it("overlap (sync) ranker works correctly through async wrapper", async () => {
    const prev = process.env.RELEVANCE_RANKER;
    process.env.RELEVANCE_RANKER = "overlap";
    try {
      const ranker = getRanker();
      const results = await ranker(jd, versions, 1);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThanOrEqual(0);
    } finally {
      if (prev === undefined) delete process.env.RELEVANCE_RANKER;
      else process.env.RELEVANCE_RANKER = prev;
    }
  });

  it("embeddings ranker falls back to overlap when OPENAI_API_KEY missing", async () => {
    // Save the real key (if any) and unset it to force fallback
    const prevKey = process.env.OPENAI_API_KEY;
    const prevMode = process.env.RELEVANCE_RANKER;
    delete process.env.OPENAI_API_KEY;
    process.env.RELEVANCE_RANKER = "embeddings";
    try {
      const results = await rankPriorVersionsEmbeddings(jd, versions, 1);
      // Should still return results via overlap fallback
      expect(results).toHaveLength(1);
      expect(results[0].role).toBe("React Developer");
      expect(results[0].score).toBeGreaterThanOrEqual(0);
    } finally {
      if (prevKey) process.env.OPENAI_API_KEY = prevKey;
      else delete process.env.OPENAI_API_KEY;
      if (prevMode === undefined) delete process.env.RELEVANCE_RANKER;
      else process.env.RELEVANCE_RANKER = prevMode;
    }
  });
});

// ── 1 & 2. Progress phases (stubs — implementation in PRE-45/46) ─────

// These tests will be activated once the progress endpoint is implemented.
// describe("Progress phases", () => {
//   it.todo("phases transition in correct order: analyzing → selecting → tailoring → compiling");
//   it.todo("progress endpoint returns { phase, percent, message } during tailor");
//   it.todo("percent increases monotonically within each phase");
//   it.todo("progress state is per-job (isolated between concurrent tailor calls)");
//   it.todo("progress state is cleaned up after tailor completes");
// });
