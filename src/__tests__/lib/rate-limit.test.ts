// Tests for src/lib/rate-limit.ts (PRE-93).
//
// Covers:
//   - checkTailorLimit: trial & pro users get an unlimited result without
//     touching usage_events.
//   - checkTailorLimit: free users are counted against FREE_TAILOR_LIMIT per
//     calendar month; below the cap → allowed; at/over → denied; remaining
//     clamps at 0.
//   - recordUsage inserts one row per call with the flow name.
//   - getMonthlyUsage returns the count column from usage_events.
//   - tailorLimitForPlan mirrors the isProOrTier rule.
//
// Mocks the DB pool AND plans.ts (so getUserPlan/isProOrTrial don't hit the
// DB and we can drive each branch deterministically).

import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  pool: { query: queryMock },
  strippedUrl: vi.fn((u: string) => u),
  createPool: vi.fn(),
}));

const getUserPlan = vi.hoisted(() => vi.fn());
const isProOrTrial = vi.hoisted(() => vi.fn());
vi.mock("@/lib/plans", async () => {
  const actual = await vi.importActual<typeof import("@/lib/plans")>("@/lib/plans");
  return {
    ...actual,
    getUserPlan,
    isProOrTrial,
  };
});

import {
  checkTailorLimit,
  recordUsage,
  getMonthlyUsage,
  tailorLimitForPlan,
} from "@/lib/rate-limit";
import { FREE_TAILOR_LIMIT } from "@/lib/plans";

const UID = "user-1";

beforeEach(() => {
  queryMock.mockReset();
  getUserPlan.mockReset();
  isProOrTrial.mockReset();
});

describe("checkTailorLimit", () => {
  it("returns an unlimited result for pro/trial without counting usage", async () => {
    getUserPlan.mockResolvedValue({ plan: "trial", trialMsLeft: 100, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
    expect(r.limit).toBe(Infinity);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns unlimited for pro_monthly", async () => {
    getUserPlan.mockResolvedValue({ plan: "pro_monthly", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    const r = await checkTailorLimit(UID);
    expect(r).toEqual({ allowed: true, remaining: Infinity, limit: Infinity });
  });

  it("allows a free user below the cap and reports remaining", async () => {
    getUserPlan.mockResolvedValue({ plan: "free", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(false);
    queryMock.mockResolvedValueOnce({ rows: [{ n: 1 }] });
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(FREE_TAILOR_LIMIT);
    expect(r.remaining).toBe(FREE_TAILOR_LIMIT - 1);
    // The count query scopes to the current calendar month.
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain("date_trunc('month', now())");
  });

  it("denies a free user at the cap with remaining 0", async () => {
    getUserPlan.mockResolvedValue({ plan: "free", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(false);
    queryMock.mockResolvedValueOnce({ rows: [{ n: FREE_TAILOR_LIMIT }] });
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.limit).toBe(FREE_TAILOR_LIMIT);
  });

  it("denies a free user over the cap (remaining clamps to 0)", async () => {
    getUserPlan.mockResolvedValue({ plan: "free", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(false);
    queryMock.mockResolvedValueOnce({ rows: [{ n: FREE_TAILOR_LIMIT + 5 }] });
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

describe("getMonthlyUsage", () => {
  it("returns the usage_events count for the current month", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ n: 2 }] });
    const n = await getMonthlyUsage(UID);
    expect(n).toBe(2);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("flow = 'tailor'");
    expect(sql).toContain("date_trunc('month', now())");
    expect(params).toEqual([UID]);
  });

  it("returns 0 when there are no rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const n = await getMonthlyUsage(UID);
    expect(n).toBe(0);
  });
});

describe("recordUsage", () => {
  it("inserts one usage_events row with the flow name", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await recordUsage(UID, "tailor");
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO usage_events");
    expect(params).toEqual([UID, "tailor"]);
  });
});

describe("tailorLimitForPlan", () => {
  it("is Infinity for unmetered plans and the free cap for free", () => {
    isProOrTrial.mockReturnValue(true);
    expect(tailorLimitForPlan("pro_monthly")).toBe(Infinity);
    expect(tailorLimitForPlan("trial")).toBe(Infinity);
    isProOrTrial.mockReturnValue(false);
    expect(tailorLimitForPlan("free")).toBe(FREE_TAILOR_LIMIT);
  });
});