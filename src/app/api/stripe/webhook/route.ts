// PRE-93: Stripe webhook receiver.
//
// Handles the lifecycle of a purchase:
//   - checkout.session.completed  → set plan (pro_monthly / pro_3month),
//                                    save stripe_customer_id, set
//                                    pro_expires_at for the 3-month pack.
//   - customer.subscription.deleted → downgrade to free.
//   - customer.subscription.updated  → sync plan from subscription status
//                                      (active/trialing/past_due → pro,
//                                       otherwise → free).
//
// This endpoint MUST be excluded from the middleware's auth gate (it's
// Stripe calling us, not a logged-in user) — see src/middleware.ts — and
// MUST read the body as raw text so the webhook signature matches.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  applyCheckoutPlan,
  constructWebhookEvent,
  downgradeToFree,
  getStripe,
  syncSubscriptionStatus,
} from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!getStripe()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  // Stripe signs the raw body; reading as JSON would alter whitespace and
  // break signature verification. req.text() gives us the unmodified bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await constructWebhookEvent(rawBody, signature);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "signature verification failed";
    return NextResponse.json({ error: `webhook signature: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
        const plan = session.metadata?.plan as "pro_monthly" | "pro_3month" | undefined;
        if (!userId || !plan) {
          console.warn("stripe webhook: checkout missing userId/plan in metadata", session.id);
          break;
        }
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        await applyCheckoutPlan(userId, plan, customerId);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        if (customerId) await downgradeToFree(customerId);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        if (customerId) await syncSubscriptionStatus(customerId, sub.status);
        break;
      }
      default:
        // Unhandled event types are intentionally ignored — Stripe retries on
        // non-2xx, so acknowledging keeps the queue clear.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("stripe webhook handler failed:", e);
    const msg = e instanceof Error ? e.message : "webhook handler failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}