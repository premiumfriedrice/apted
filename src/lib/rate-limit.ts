// PRE-93: Per-user rate limiting for the tailor flow (the unit of value).
//
// Two gates run on every /api/tailor request, cheapest first:
//
//   1. Velocity throttle (MAX_TAILOR_PER_HOUR) - applies to EVERYONE including
//      BYOK users. One tailored session every few minutes sustained is beyond
//      any human, so a generous hourly cap kills scripts/loops without
//      affecting real use. This is infra/abuse protection, not cost control.
//
//   2. Monthly fair-use cap - only APP-SUBSIDIZED users are metered:
//        - Trial (subsidized): TRIAL_SUBSIDIZED_TAILOR_LIMIT / calendar month
//          (effectively across the 3 no-card days; bounds trial CAC).
//        - Pro (subsidized):    PRO_SUBSIDIZED_TAILOR_LIMIT / calendar month
//          (positive margin on $9.99; a human rarely approaches it).
//        - Free:  FREE_TAILOR_LIMIT / calendar month (the upsell lever; BYOK
//          on free does NOT unlock unlimited - "unlimited with your key" is a
//          Pro benefit).
//      BYOK users on trial/pro are UNCAPPED: they spend their own tokens, so
//      there is no cost to bound. `tailorUsesByokKey` mirrors the tailor
//      flow's actual provider routing so unlimited is only granted for a key
//      the flow really uses.
//
// `recordUsage` is called AFTER the LLM call + draft insert succeed (never on
// a 429 or a failed run), so rejected requests never increment the counters.

import { pool } from "./db";
import {
  FREE_TAILOR_LIMIT,
  PRO_SUBSIDIZED_TAILOR_LIMIT,
  TRIAL_SUBSIDIZED_TAILOR_LIMIT,
  getUserPlan,
  isProOrTrial,
  type Plan,
} from "./plans";
import { tailorUsesByokKey } from "./providers";

export type Flow = "tailor";

export type LimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  // Lets the client distinguish "slow down" (velocity) from "upgrade" (monthly).
  reason?: "velocity" | "monthly";
};

// Velocity throttle for the tailor flow. Global (incl BYOK). Env-overridable.
export const MAX_TAILOR_PER_HOUR =
  Number(process.env.MAX_TAILOR_PER_HOUR) || 10;

type Counts = { monthly: number; hourly: number };

// Monthly + hourly tailor counts in two indexed queries (parallel). The
// `(user_id, flow, created_at DESC)` index makes both cheap.
async function getTailorCounts(userId: string): Promise<Counts> {
  const [monthlyRes, hourlyRes] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS n FROM usage_events
       WHERE user_id = $1 AND flow = 'tailor'
         AND created_at >= date_trunc('month', now())`,
      [userId],
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM usage_events
       WHERE user_id = $1 AND flow = 'tailor'
         AND created_at >= now() - interval '1 hour'`,
      [userId],
    ),
  ]);
  return {
    monthly: monthlyRes.rows[0]?.n ?? 0,
    hourly: hourlyRes.rows[0]?.n ?? 0,
  };
}

// Monthly count only - used by /api/usage for the upgrade page / dashboard.
export async function getMonthlyUsage(userId: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM usage_events
     WHERE user_id = $1 AND flow = 'tailor'
       AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  return r.rows[0]?.n ?? 0;
}

// Decide whether /api/tailor may proceed. See file header for the gate order.
export async function checkTailorLimit(userId: string): Promise<LimitResult> {
  const { monthly, hourly } = await getTailorCounts(userId);

  // Gate 1: velocity. Hits everyone; remaining is hourly headroom.
  if (hourly >= MAX_TAILOR_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      limit: MAX_TAILOR_PER_HOUR,
      reason: "velocity",
    };
  }

  const { plan } = await getUserPlan(userId);

  // Gate 2 (monthly) only binds APP-SUBSIDIZED trial/pro users; BYOK is uncapped.
  if (isProOrTrial(plan) && tailorUsesByokKey(userId)) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  const limit = tailorLimitForPlan(plan);
  const remaining = Math.max(0, limit - monthly);
  return {
    allowed: monthly < limit,
    remaining,
    limit,
    reason: monthly >= limit ? "monthly" : undefined,
  };
}

// Insert a usage_events row for a metered flow. Called after the flow
// succeeds (post LLM + draft). Cheap single insert.
export async function recordUsage(userId: string, flow: Flow): Promise<void> {
  await pool.query(
    `INSERT INTO usage_events (user_id, flow) VALUES ($1, $2)`,
    [userId, flow],
  );
}

// The APP-SUBSIDIZED monthly cap for a plan. BYOK unlimited is decided in
// checkTailorLimit (not here) - this returns the numeric ceiling the upgrade
// page / /api/usage report for subsidized users. Free stays 3 regardless of
// BYOK (unlimited-with-key is a Pro benefit).
export function tailorLimitForPlan(plan: Plan): number {
  switch (plan) {
    case "trial":
      return TRIAL_SUBSIDIZED_TAILOR_LIMIT;
    case "pro_monthly":
    case "pro_3month":
      return PRO_SUBSIDIZED_TAILOR_LIMIT;
    case "free":
      return FREE_TAILOR_LIMIT;
  }
}