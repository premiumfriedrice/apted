// Tests for src/lib/rate-limit.ts (PRE-93).
//
// Covers the two-gate design:
//   Gate 1 — velocity throttle (MAX_TAILOR_PER_HOUR, global incl BYOK)
//   Gate 2 — monthly fair-use cap, which binds ONLY app-subsidized users:
//     - BYOK trial/pro  → unlimited (their tokens)
//     - Subsidized trial → TRIAL_SUBSIDIZED_TAILOR_LIMIT
//     - Subsidized pro   → PRO_SUBSIDIZED_TAILOR_LIMIT
//     - Free              → FREE_TAILOR_LIMIT (BYOK on free stays capped)
//
// Mocks the DB pool (so getTailorCounts returns deterministic monthly/hourly
// counts based on the SQL), plans.getUserPlan/isProOrTrial, and
// providers.tailorUsesByokKey.

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

const tailorUsesByokKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers", () => ({
  tailorUsesByokKey,
}));

import {
  checkTailorLimit,
  recordUsage,
  getMonthlyUsage,
  tailorLimitForPlan,
  MAX_TAILOR_PER_HOUR,
} from "@/lib/rate-limit";
import {
  FREE_TAILOR_LIMIT,
  TRIAL_SUBSIDIZED_TAILOR_LIMIT,
  PRO_SUBSIDIZED_TAILOR_LIMIT,
} from "@/lib/plans";

const UID = "user-1";

// Drive getTailorCounts / getMonthlyUsage from the Two SELECT queries by shape.
// Order is non-deterministic (Promise.all), so match on the SQL fragment.
function mockCounts(monthly: number, hourly: number) {
  queryMock.mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("interval '1 hour'")) {
      return Promise.resolve({ rows: [{ n: hourly }] });
    }
    if (typeof sql === "string" && sql.includes("date_trunc('month'")) {
      return Promise.resolve({ rows: [{ n: monthly }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  queryMock.mockReset();
  getUserPlan.mockReset();
  isProOrTrial.mockReset();
  tailorUsesByokKey.mockReset();
});

describe("checkTailorLimit — velocity throttle (gate 1, global)", () => {
  it("denies a BYOK pro user who hit the hourly cap (infra protection)", async () => {
    getUserPlan.mockResolvedValue({ plan: "pro_monthly", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(true);
    mockCounts(5, MAX_TAILOR_PER_HOUR);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("velocity");
    expect(r.limit).toBe(MAX_TAILOR_PER_HOUR);
    expect(r.remaining).toBe(0);
  });

  it("denies a subsidized free user at the hourly cap before the monthly check", async () => {
    getUserPlan.mockResolvedValue({ plan: "free", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(false);
    tailorUsesByokKey.mockReturnValue(false);
    mockCounts(1, MAX_TAILOR_PER_HOUR);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("velocity");
  });

  it("lets a BYOK pro user under the hourly cap through to unlimited", async () => {
    getUserPlan.mockResolvedValue({ plan: "pro_monthly", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(true);
    mockCounts(40, MAX_TAILOR_PER_HOUR - 1);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
    expect(r.limit).toBe(Infinity);
  });
});

describe("checkTailorLimit — BYOK unlimited (gate 2 bypass)", () => {
  it("returns unlimited for BYOK trial without bounding to the subsidized cap", async () => {
    getUserPlan.mockResolvedValue({ plan: "trial", trialMsLeft: 100, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(true);
    mockCounts(TRIAL_SUBSIDIZED_TAILOR_LIMIT + 10, 0);
    const r = await checkTailorLimit(UID);
    expect(r).toEqual({ allowed: true, remaining: Infinity, limit: Infinity });
  });

  it("does NOT grant unlimited to a free user even if BYOK", async () => {
    getUserPlan.mockResolvedValue({ plan: "free", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(false);
    tailorUsesByokKey.mockReturnValue(true);
    mockCounts(2, 0);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(FREE_TAILOR_LIMIT);
    expect(r.remaining).toBe(FREE_TAILOR_LIMIT - 2);
  });
});

describe("checkTailorLimit — subsidized monthly cap (gate 2)", () => {
  it("allows a subsidized trial below the trial cap and reports remaining", async () => {
    getUserPlan.mockResolvedValue({ plan: "trial", trialMsLeft: 100, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(false);
    mockCounts(10, 0);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(TRIAL_SUBSIDIZED_TAILOR_LIMIT);
    expect(r.remaining).toBe(TRIAL_SUBSIDIZED_TAILOR_LIMIT - 10);
    expect(r.reason).toBeUndefined();
  });

  it("denies a subsidized trial at the trial cap", async () => {
    getUserPlan.mockResolvedValue({ plan: "trial", trialMsLeft: 100, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(false);
    mockCounts(TRIAL_SUBSIDIZED_TAILOR_LIMIT, 0);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(TRIAL_SUBSIDIZED_TAILOR_LIMIT);
    expect(r.remaining).toBe(0);
    expect(r.reason).toBe("monthly");
  });

  it("allows a subsidized pro below the pro cap", async () => {
    getUserPlan.mockResolvedValue({ plan: "pro_monthly", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(false);
    mockCounts(30, 0);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(PRO_SUBSIDIZED_TAILOR_LIMIT);
    expect(r.remaining).toBe(PRO_SUBSIDIZED_TAILOR_LIMIT - 30);
  });

  it("denies a subsidized pro over the pro cap (remaining clamps to 0)", async () => {
    getUserPlan.mockResolvedValue({ plan: "pro_3month", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(true);
    tailorUsesByokKey.mockReturnValue(false);
    mockCounts(PRO_SUBSIDIZED_TAILOR_LIMIT + 5, 0);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.limit).toBe(PRO_SUBSIDIZED_TAILOR_LIMIT);
    expect(r.reason).toBe("monthly");
  });

  it("uses FREE_TAILOR_LIMIT for a subsidized free user", async () => {
    getUserPlan.mockResolvedValue({ plan: "free", trialMsLeft: null, proExpiresAt: null });
    isProOrTrial.mockReturnValue(false);
    tailorUsesByokKey.mockReturnValue(false);
    mockCounts(1, 0);
    const r = await checkTailorLimit(UID);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(FREE_TAILOR_LIMIT);
    expect(r.remaining).toBe(FREE_TAILOR_LIMIT - 1);
  });
});

describe("getMonthlyUsage", () => {
  it("returns the usage_events count for the current month", async () => {
    mockCounts(2, 99); // hourly unused here, but mock is shape-driven
    const n = await getMonthlyUsage(UID);
    expect(n).toBe(2);
  });

  it("returns 0 when there are no rows", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const n = await getMonthlyUsage(UID);
    expect(n).toBe(0);
  });
});

describe("recordUsage", () => {
  it("inserts one usage_events row with the flow name", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await recordUsage(UID, "tailor");
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO usage_events");
    expect(params).toEqual([UID, "tailor"]);
  });
});

describe("tailorLimitForPlan", () => {
  it("returns the subsidized numeric cap per plan (BYOK infinity handled elsewhere)", () => {
    expect(tailorLimitForPlan("trial")).toBe(TRIAL_SUBSIDIZED_TAILOR_LIMIT);
    expect(tailorLimitForPlan("pro_monthly")).toBe(PRO_SUBSIDIZED_TAILOR_LIMIT);
    expect(tailorLimitForPlan("pro_3month")).toBe(PRO_SUBSIDIZED_TAILOR_LIMIT);
    expect(tailorLimitForPlan("free")).toBe(FREE_TAILOR_LIMIT);
  });
});

describe("PLAN constants", () => {
  it("matches the handoff defaults (free=3, trial=25, pro=60, hourly=10)", () => {
    expect(FREE_TAILOR_LIMIT).toBe(3);
    expect(TRIAL_SUBSIDIZED_TAILOR_LIMIT).toBe(25);
    expect(PRO_SUBSIDIZED_TAILOR_LIMIT).toBe(60);
    expect(MAX_TAILOR_PER_HOUR).toBe(10);
  });
});