// PRE-93: Per-user plan + usage stats for the upgrade page, dashboard, and
// the AppShell plan badge. One GET, no writes.
//
// Response shape:
//   {
//     plan: "trial" | "free" | "pro_monthly" | "pro_3month",
//     trialDaysLeft: number | null,   // whole days left in trial (trial only)
//     proExpiresAt: string | null,    // ISO for pro_3month's fixed expiry
//     tailorUsed: number,             // sessions this calendar month
//     tailorLimit: number | null      // monthly cap; null = unlimited
//   }
//
// `tailorLimit` is null (not Infinity) on the wire because JSON.stringify
// turns Infinity into `null` anyway and an explicit null is clearer for
// clients ("no limit") than relying on that coercion.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { FREE_TAILOR_LIMIT, getPlanInfo, isProOrTrial } from "@/lib/plans";
import { getMonthlyUsage } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { plan, trialDaysLeft, proExpiresAt } = await getPlanInfo(userId);
  const tailorUsed = await getMonthlyUsage(userId);
  // free: report the cap so the upgrade page can show "X / 3 used".
  // Pro/trial: null means "unlimited" on the wire (see file header).
  const tailorLimit = isProOrTrial(plan) ? null : FREE_TAILOR_LIMIT;

  return NextResponse.json({
    plan,
    trialDaysLeft,
    proExpiresAt: proExpiresAt ? proExpiresAt.toISOString() : null,
    tailorUsed,
    tailorLimit,
  });
}