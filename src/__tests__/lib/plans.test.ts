// Tests for src/lib/plans.ts (PRE-93).
//
// Covers:
//   - getUserPlan returns the stored plan + trial/pro metadata when in-window.
//   - trial lapses to free once TRIAL_DURATION_MS has passed AND persists the
//     transition (UPDATE toward 'free') so subsequent reads skip the math.
//   - pro_3month lapses to free once pro_expires_at is in the past AND
//     persists the transition.
//   - pro_monthly stays pro (recurring; no expiry column).
//   - missing user row / null plan → free (never grant unlimited access).
//   - isProOrTrial covers the union.
//   - getPlanInfo surfaces trailDaysLeft (whole-day ceiling) for trial.
//
// Mocks the DB pool so no Postgres is required.

import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  pool: { query: queryMock },
  setRlsUserOnPool: vi.fn(async () => {}),
  strippedUrl: vi.fn((u: string) => u),
  createPool: vi.fn(),
}));

import {
  TRIAL_DURATION_MS,
  PRO_3MONTH_DURATION_MS,
  FREE_TAILOR_LIMIT,
  TRIAL_SUBSIDIZED_TAILOR_LIMIT,
  PRO_SUBSIDIZED_TAILOR_LIMIT,
  isProOrTrial,
  getUserPlan,
  getPlanInfo,
  type Plan,
} from "@/lib/plans";

const UID = "user-1";

beforeEach(() => {
  queryMock.mockReset();
});

function selectRow(row: Record<string, unknown> | null) {
  queryMock.mockResolvedValueOnce({ rows: row ? [row] : [] });
}

describe("isProOrTrial", () => {
  it("is true for trial and both pro tiers, false for free", () => {
    const cases: Array<[Plan, boolean]> = [
      ["trial", true],
      ["pro_monthly", true],
      ["pro_3month", true],
      ["free", false],
    ];
    for (const [p, expected] of cases) expect(isProOrTrial(p)).toBe(expected);
  });
});

describe("getUserPlan", () => {
  it("returns trial within the 3-day window", async () => {
    selectRow({
      plan: "trial",
      plan_started_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      pro_expires_at: null,
    });
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("trial");
    expect(r.trialMsLeft).toBeGreaterThan(0);
    expect(r.proExpiresAt).toBeNull();
  });

  it("lapses trial to free after TRIAL_DURATION_MS and persists the change", async () => {
    selectRow({
      plan: "trial",
      plan_started_at: new Date(Date.now() - (TRIAL_DURATION_MS + 1000)),
      pro_expires_at: null,
    });
    // The UPDATE call after the lap detection.
    const updateMock = vi.fn().mockResolvedValueOnce({ rows: [] });
    queryMock.mockImplementationOnce(updateMock);
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("free");
    expect(r.trialMsLeft).toBeNull();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [sql, params] = updateMock.mock.calls[0];
    expect(sql).toContain("UPDATE \"user\" SET plan = 'free'");
    expect(params).toEqual([UID]);
  });

  it("keeps pro_monthly pro (recurring, no expiry column)", async () => {
    selectRow({ plan: "pro_monthly", plan_started_at: new Date(0), pro_expires_at: null });
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("pro_monthly");
    expect(r.proExpiresAt).toBeNull();
  });

  it("keeps pro_3month pro while pro_expires_at is in the future", async () => {
    const exp = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    selectRow({ plan: "pro_3month", plan_started_at: new Date(0), pro_expires_at: exp });
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("pro_3month");
    expect(r.proExpiresAt).toEqual(exp);
  });

  it("lapses pro_3month to free after pro_expires_at and persists", async () => {
    const exp = new Date(Date.now() - 1000);
    selectRow({ plan: "pro_3month", plan_started_at: new Date(0), pro_expires_at: exp });
    const updateMock = vi.fn().mockResolvedValueOnce({ rows: [] });
    queryMock.mockImplementationOnce(updateMock);
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("free");
    expect(r.proExpiresAt).toBeNull();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toContain("plan = 'free'");
    expect(updateMock.mock.calls[0][0]).toContain("plan = 'pro_3month'");
  });

  it("returns free for a missing user row (no unlimited grant)", async () => {
    selectRow(null);
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("free");
    expect(r.trialMsLeft).toBeNull();
    expect(r.proExpiresAt).toBeNull();
  });

  it("returns free for a null plan value", async () => {
    selectRow({ plan: null, plan_started_at: null, pro_expires_at: null });
    const r = await getUserPlan(UID);
    expect(r.plan).toBe("free");
  });
});

describe("getPlanInfo", () => {
  it("surfaces whole-day trialDaysLeft for an active trial", async () => {
    // ~2.5 days left → ceil → 3
    selectRow({
      plan: "trial",
      plan_started_at: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000),
      pro_expires_at: null,
    });
    const info = await getPlanInfo(UID);
    expect(info.plan).toBe("trial");
    // TRIAL_DURATION_MS - ~12h ≈ 2.5 days → ceil(2.5) = 3
    expect(info.trialDaysLeft).toBeGreaterThanOrEqual(2);
    expect(info.trialDaysLeft).toBeLessThanOrEqual(3);
    expect(info.proExpiresAt).toBeNull();
  });

  it("returns null trialDaysLeft for non-trial plans", async () => {
    selectRow({ plan: "pro_monthly", plan_started_at: new Date(0), pro_expires_at: null });
    const info = await getPlanInfo(UID);
    expect(info.trialDaysLeft).toBeNull();
  });
});

describe("PLAN constants", () => {
  it("matches the handoff durations", () => {
    expect(TRIAL_DURATION_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(PRO_3MONTH_DURATION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("exposes the fair-use tailor caps", () => {
    expect(FREE_TAILOR_LIMIT).toBe(3);
    expect(TRIAL_SUBSIDIZED_TAILOR_LIMIT).toBe(25);
    expect(PRO_SUBSIDIZED_TAILOR_LIMIT).toBe(30);
  });
});