import { describe, it, expect } from "vitest";
import { computeFunnelStats } from "../sankey";

// Mirrors the mock-seed distribution in scripts/seed-mock-applications.ts —
// every funnel ribbon exercised with known expected counts.
const input = [
  ...Array.from({ length: 4 }, () => ({ outcome: "draft", interviewRound: null, rejectedAfterRound: null })),
  ...Array.from({ length: 5 }, () => ({ outcome: "applied", interviewRound: null, rejectedAfterRound: null })),
  ...Array.from({ length: 3 }, () => ({ outcome: "ghosted", interviewRound: null, rejectedAfterRound: null })),
  ...Array.from({ length: 4 }, () => ({ outcome: "rejected", interviewRound: null, rejectedAfterRound: 0 })),
  ...Array.from({ length: 2 }, () => ({ outcome: "rejected", interviewRound: null, rejectedAfterRound: 1 })),
  { outcome: "rejected", interviewRound: null, rejectedAfterRound: 2 },
  ...Array.from({ length: 2 }, () => ({ outcome: "interviewing", interviewRound: 1, rejectedAfterRound: null })),
  { outcome: "interviewing", interviewRound: 2, rejectedAfterRound: null },
  { outcome: "offer", interviewRound: 3, rejectedAfterRound: null },
  { outcome: "declined", interviewRound: 3, rejectedAfterRound: null },
];

describe("computeFunnelStats", () => {
  it("computes the full funnel for the 24-app seed distribution", () => {
    const stats = computeFunnelStats(input);
    expect(stats).toEqual({
      total: 24,
      screening: 20,
      technical: 8,
      final: 4,
      offers: 1,
      screeningRejections: 4,
      technicalRejections: 2,
      finalRejections: 1,
    });
  });

  it("treats applied/ghosted as screening-only (ghosted ribbon)", () => {
    const stats = computeFunnelStats([
      { outcome: "applied", interviewRound: null, rejectedAfterRound: null },
      { outcome: "ghosted", interviewRound: null, rejectedAfterRound: null },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.screening).toBe(2);
    expect(stats.technical).toBe(0);
  });

  it("counts offers through technical and final", () => {
    const stats = computeFunnelStats([
      { outcome: "offer", interviewRound: 2, rejectedAfterRound: null },
    ]);
    expect(stats.technical).toBe(1);
    expect(stats.final).toBe(1);
    expect(stats.offers).toBe(1);
  });

  it("returns all zeros for an empty pipeline", () => {
    expect(computeFunnelStats([])).toEqual({
      total: 0,
      screening: 0,
      technical: 0,
      final: 0,
      offers: 0,
      screeningRejections: 0,
      technicalRejections: 0,
      finalRejections: 0,
    });
  });

  it("maps rejection rounds to the right stage", () => {
    const stats = computeFunnelStats([
      { outcome: "rejected", interviewRound: null, rejectedAfterRound: 0 },
      { outcome: "rejected", interviewRound: null, rejectedAfterRound: 1 },
      { outcome: "rejected", interviewRound: null, rejectedAfterRound: 3 },
    ]);
    expect(stats.screening).toBe(3);
    expect(stats.screeningRejections).toBe(1);
    expect(stats.technical).toBe(2);
    expect(stats.technicalRejections).toBe(1);
    expect(stats.final).toBe(1);
    expect(stats.finalRejections).toBe(1);
  });
});
