// PRE-93: Create a Stripe Checkout session and redirect the upgrade page to
// it. Body: { plan: 'pro_monthly' | 'pro_3month' }. Returns { url }.
//
// Requires an authenticated user (the suite-wide requireUserId gate). When
// Stripe isn't configured (local dev), returns a 503 so the page can show a
// clear "payments not configured" message instead of a redirect loop.

import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { createCheckoutSession, getStripe, priceIdForPlan } from "@/lib/stripe";

export const runtime = "nodejs";

const Body = z.object({
  plan: z.enum(["pro_monthly", "pro_3month"]),
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!getStripe()) {
    return NextResponse.json(
      { error: "payments_not_configured" },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!priceIdForPlan(parsed.plan)) {
    return NextResponse.json(
      { error: `No Stripe price configured for plan "${parsed.plan}"` },
      { status: 503 },
    );
  }

  // Resolve the user's email for Stripe customer creation on first checkout.
  const u = await pool.query(`SELECT email FROM "user" WHERE id = $1`, [userId]);
  const userEmail = u.rows[0]?.email ?? null;

  try {
    const session = await createCheckoutSession({
      userId,
      userEmail,
      plan: parsed.plan,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "checkout failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}