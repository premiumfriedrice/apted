// PRE-93: Create a Stripe Customer Portal session for managing/cancelling an
// existing subscription. Returns { url }. Authenticated; requires the user
// to already have a stripe_customer_id (i.e. have purchased before).
//
// Returns 503 when Stripe isn't configured and 409 when the user has no
// Stripe customer yet (so the page can keep showing the pricing cards).

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { createPortalSession, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!getStripe()) {
    return NextResponse.json(
      { error: "payments_not_configured" },
      { status: 503 },
    );
  }

  try {
    const session = await createPortalSession(userId);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "portal failed";
    // "No Stripe customer found" → 409 (user hasn't purchased yet).
    const status = /No Stripe customer/.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}