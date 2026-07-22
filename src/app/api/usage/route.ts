// PRE-93: Per-user plan + usage stats for the upgrade page, dashboard, and
// the AppShell plan badge. One GET, no writes.
//
// Response shape:
//   {
//     plan: "trial" | "free" | "pro_monthly" | "pro_3month",
//     trialDaysLeft: number | null,   // whole days left in trial (trial only)
//     proExpiresAt: string | null,    // ISO for pro_3month's fixed expiry
//     byok: boolean,                  // is the tailor flow using the user's own key?
//     tailorUsed: number,             // sessions this calendar month
//     tailorLimit: number | null      // monthly cap; null = unlimited (BYOK pro/trial)
//   }
//
// `tailorLimit` is null (not Infinity) on the wire because JSON.stringify turns
// Infinity into `null` anyway, and an explicit null reads cleaner for clients
// ("no limit"). It's null ONLY for BYOK trial/pro users — subsidized pro/trial
// get their numeric fair-use cap, and free always gets 3 (BYOK on free does
// not unlock unlimited; that's a Pro benefit).

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getPlanInfo, isProOrTrial } from "@/lib/plans";
import { getMonthlyUsage, tailorLimitForPlan } from "@/lib/rate-limit";
import { tailorUsesByokKey } from "@/lib/providers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { plan, trialDaysLeft, proExpiresAt } = await getPlanInfo(userId);
  const byok = isProOrTrial(plan) && tailorUsesByokKey(userId);
  const tailorUsed = await getMonthlyUsage(userId);
  // BYOK trial/pro → null (unlimited, their tokens). Subsidized pro/trial → the
  // fair-use cap. Free → 3 regardless of BYOK.
  const tailorLimit = isProOrTrial(plan) && byok ? null : tailorLimitForPlan(plan);

  return NextResponse.json({
    plan,
    trialDaysLeft,
    proExpiresAt: proExpiresAt ? proExpiresAt.toISOString() : null,
    byok,
    tailorUsed,
    tailorLimit,
  });
}