// PRE-93: Plan definitions, trial/expiry logic, and the effective-plan
// resolver used by rate limiting, the upgrade page, and the AppShell badge.
//
// Three things this module owns:
//
//   1. The `Plan` union and its constants (trial length, 3-month pack length,
//      free-tier tailor limit).
//   2. `getUserPlan(userId)` — reads the plan row and computes the effective
//      plan, persisting a transition to 'free' when a trial or pro window has
//      elapsed so the DB stays in sync (subsequent reads are cheap and every
//      surface — rate limit, upgrade page, sidebar badge — sees the same
//      value without each re-deriving the boundary).
//   3. `isProOrTrial(plan)` — the "is this user metered at all?" predicate
//      shared by rate-limit.ts.
//
// Pricing (mirrors the handoff):
//   - Trial (3 days, starts on signup): unlimited everything, no card.
//   - Free (after trial): 3 tailor sessions / calendar month.
//   - Pro Monthly ($9.99/mo): unlimited, recurring.
//   - Pro 3-Month Pack ($24.99 one-time): unlimited for 90 days, then Free.

import { pool } from "./db";

export type Plan = "trial" | "free" | "pro_monthly" | "pro_3month";

export const TRIAL_DURATION_DAYS = 3;
export const PRO_3MONTH_DURATION_DAYS = 90;
export const FREE_TAILOR_LIMIT = 3;

export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
export const PRO_3MONTH_DURATION_MS =
  PRO_3MONTH_DURATION_DAYS * 24 * 60 * 60 * 1000;

// True when the plan is unmetered (trial or either pro tier). Free users are
// the only ones subject to /api/tailor rate limiting.
export function isProOrTrial(plan: Plan): boolean {
  return plan === "trial" || plan === "pro_monthly" || plan === "pro_3month";
}

// A user's stored plan row. Columns are nullable on the write path (only
// `plan` and `plan_started_at` are NOT NULL via the migration defaults) so
// every field is marked optional defensively.
type PlanRow = {
  plan: Plan | null;
  plan_started_at: Date | null;
  pro_expires_at: Date | null;
};

export type EffectivePlan = {
  plan: Plan;
  // When the user is on trial: ms remaining before it lapses to free. Null on
  // non-trial plans.
  trialMsLeft: number | null;
  // When the user is on a pro plan with a fixed expiry (pro_3month): the
  // expiry Date. Null for pro_monthly (recurring, no expiry column) and free.
  proExpiresAt: Date | null;
};

export async function getUserPlan(userId: string): Promise<EffectivePlan> {
  const r = await pool.query(
    `SELECT plan, plan_started_at, pro_expires_at FROM "user" WHERE id = $1`,
    [userId],
  );
  const row: PlanRow | undefined = r.rows[0];

  // No user row (shouldn't happen — Better Auth creates the row on signup and
  // local mode uses the backfilled 'local' row). Treat as free so a missing
  // row never grants unlimited access.
  if (!row || !row.plan) {
    return { plan: "free", trialMsLeft: null, proExpiresAt: null };
  }

  const stored = row.plan;
  const now = Date.now();

  // Trial: lapses to free once TRIAL_DURATION_MS has elapsed since
  // plan_started_at. Persist the transition so subsequent reads skip the
  // boundary math and so the upgrade page/badge agree.
  if (stored === "trial") {
    const startedAt = row.plan_started_at ? row.plan_started_at.getTime() : now;
    const elapsed = now - startedAt;
    const trialMsLeft = Math.max(0, TRIAL_DURATION_MS - elapsed);
    if (trialMsLeft <= 0) {
      await pool.query(
        `UPDATE "user" SET plan = 'free', pro_expires_at = NULL WHERE id = $1 AND plan = 'trial'`,
        [userId],
      );
      return { plan: "free", trialMsLeft: null, proExpiresAt: null };
    }
    return { plan: "trial", trialMsLeft, proExpiresAt: null };
  }

  // Pro monthly: recurring, no expiry column. Stays pro until Stripe tells us
  // otherwise (customer.subscription.deleted → free).
  if (stored === "pro_monthly") {
    return { plan: "pro_monthly", trialMsLeft: null, proExpiresAt: null };
  }

  // Pro 3-month pack: expires pro_expires_at after the purchase. Once past
  // the expiry, lapse to free and persist.
  if (stored === "pro_3month") {
    const expiresAt = row.pro_expires_at ? row.pro_expires_at.getTime() : null;
    if (expiresAt !== null && now >= expiresAt) {
      await pool.query(
        `UPDATE "user" SET plan = 'free', pro_expires_at = NULL WHERE id = $1 AND plan = 'pro_3month'`,
        [userId],
      );
      return { plan: "free", trialMsLeft: null, proExpiresAt: null };
    }
    return {
      plan: "pro_3month",
      trialMsLeft: null,
      proExpiresAt: row.pro_expires_at,
    };
  }

  // free (or any unrecognized value): treat as free.
  return { plan: "free", trialMsLeft: null, proExpiresAt: null };
}

// Convenience: the whole user-facing plan row joined with the trial/pro
// metadata, returned as one payload that the /api/usage route and the
// upgrade page can hand straight to the client.
export async function getPlanInfo(userId: string) {
  const { plan, trialMsLeft, proExpiresAt } = await getUserPlan(userId);
  const trialDaysLeft =
    trialMsLeft !== null ? Math.ceil(trialMsLeft / (24 * 60 * 60 * 1000)) : null;
  return { plan, trialMsLeft, trialDaysLeft, proExpiresAt };
}