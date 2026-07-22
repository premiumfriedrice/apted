// PRE-93: Per-user rate limiting for metered flows.
//
// The tailored resume session is the unit of value: a user clicks "Tailor
// Resume", gets a draft, refines it as much as they want via chat, saves it —
// that's one session. Only /api/tailor is metered; edit, generate-bullets,
// and extract are unlimited.
//
//   - Trial & Pro tiers: no limit (Infinity).
//   - Free tier: FREE_TAILOR_LIMIT tailor sessions per calendar month,
//     resetting on the 1st. Counted via rows in usage_events for flow='tailor'
//     with created_at in the current month.
//
// `recordUsage` is called AFTER the LLM call succeeds (never on a 429), so an
// exhausted quota is never incremented by a rejected request.

import { pool } from "./db";
import {
  FREE_TAILOR_LIMIT,
  getUserPlan,
  isProOrTrial,
  type Plan,
} from "./plans";

export type Flow = "tailor";

export type LimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

// How many tailor sessions the user has used in the current calendar month.
// Returned to /api/usage for the upgrade page / dashboard counter.
export async function getMonthlyUsage(userId: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM usage_events
     WHERE user_id = $1 AND flow = 'tailor'
       AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  return r.rows[0]?.n ?? 0;
}

// Decide whether /api/tailor may proceed for this user. Pro/trial users get
// an unlimited result (no DB count). Free users are counted against
// FREE_TAILOR_LIMIT for the current calendar month.
export async function checkTailorLimit(userId: string): Promise<LimitResult> {
  const { plan } = await getUserPlan(userId);
  if (isProOrTrial(plan)) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  // free
  const used = await getMonthlyUsage(userId);
  const remaining = Math.max(0, FREE_TAILOR_LIMIT - used);
  return {
    allowed: used < FREE_TAILOR_LIMIT,
    remaining,
    limit: FREE_TAILOR_LIMIT,
  };
}

// Insert a usage_events row for a metered flow. Called after the flow
// succeeds. Cheap (single insert, no read).
export async function recordUsage(userId: string, flow: Flow): Promise<void> {
  await pool.query(
    `INSERT INTO usage_events (user_id, flow) VALUES ($1, $2)`,
    [userId, flow],
  );
}

// The effective limit for a plan — Infinity for unmetered plans, the free
// tailor limit otherwise. Used by /api/usage to report `tailorLimit` without
// re-encoding the tier rules.
export function tailorLimitForPlan(plan: Plan): number {
  return isProOrTrial(plan) ? Infinity : FREE_TAILOR_LIMIT;
}