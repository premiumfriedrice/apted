// PRE-93: Stripe client init + helpers for checkout, portal, and webhook
// signature verification.
//
// Env vars (see .env.example):
//   STRIPE_SECRET_KEY       — sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET   — whsec_... (set per webhook endpoint in Stripe dashboard)
//   STRIPE_MONTHLY_PRICE_ID — price_... for the $9.99/mo recurring subscription
//   STRIPE_3MONTH_PRICE_ID  — price_... for the $24.99 one-time 90-day access
//
// `getStripe()` is lazy so the Stripe SDK never instantiates when the env var
// is unset (local dev / tests / routes that don't need payments). Callers
// that hit Stripe must guard with `if (!getStripe())` and return a 503 so the
// upgrade page can render a clear message instead of crashing.

import Stripe from "stripe";
import { pool } from "./db";
import type { Plan } from "./plans";
import { PRO_3MONTH_DURATION_MS } from "./plans";

const stripeVersion = "2025-08-27.basil"; // pin to a stripe-node API version

let cached: Stripe | null = null;

// Returns the Stripe client when STRIPE_SECRET_KEY is set, else null. Cached
// after first call.
export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, { apiVersion: stripeVersion as Stripe.LatestApiVersion });
  return cached;
}

// True when payments are configured (checkout/portal/webhook can run).
export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

type CheckoutPlan = Extract<Plan, "pro_monthly" | "pro_3month">;

// Resolve the Stripe price id for a checkout plan.
export function priceIdForPlan(plan: CheckoutPlan): string | null {
  if (plan === "pro_monthly") return process.env.STRIPE_MONTHLY_PRICE_ID ?? null;
  if (plan === "pro_3month") return process.env.STRIPE_3MONTH_PRICE_ID ?? null;
  return null;
}

// Create a Stripe Checkout session for a subscription (monthly) or a
// one-time payment (3-month pack). Reuses the user's existing
// stripe_customer_id when present by passing customer + customer_email as a
// fallback pair. The plan is echoed back via client_reference_id and in the
// session metadata so the webhook can route it without re-deriving.
export async function createCheckoutSession(opts: {
  userId: string;
  userEmail: string | null;
  plan: CheckoutPlan;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const priceId = priceIdForPlan(opts.plan);
  if (!priceId) throw new Error(`No Stripe price configured for plan "${opts.plan}"`);

  // Look up an existing customer id so recurring subscriptions attach to the
  // same customer across purchases.
  const existing = await pool.query(
    `SELECT stripe_customer_id FROM "user" WHERE id = $1`,
    [opts.userId],
  );
  const existingCustomerId = existing.rows[0]?.stripe_customer_id ?? null;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: opts.plan === "pro_monthly" ? "subscription" : "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: opts.userId,
    metadata: { userId: opts.userId, plan: opts.plan },
    success_url: `${origin()}/upgrade?checkout=success`,
    cancel_url: `${origin()}/upgrade?checkout=cancelled`,
  };
  // Stripe requires that `customer` and `customer_email` are NOT both set.
  // Prefer the existing customer id; fall back to email only on first checkout.
  if (existingCustomerId) {
    params.customer = existingCustomerId;
  } else if (opts.userEmail) {
    params.customer_email = opts.userEmail;
  }

  return stripe.checkout.sessions.create(params);
}

// Create a Stripe Customer Portal session so Pro users can manage/cancel
// their subscription. Requires a stripe_customer_id on the user row.
export async function createPortalSession(userId: string): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const r = await pool.query(
    `SELECT stripe_customer_id FROM "user" WHERE id = $1`,
    [userId],
  );
  const customerId = r.rows[0]?.stripe_customer_id ?? null;
  if (!customerId) throw new Error("No Stripe customer found for this user");

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin()}/upgrade`,
  });
}

// Verify the webhook signature and reconstruct the event. Throws on a
// signature mismatch (Stripe requires us to abort with a 400).
export async function constructWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<Stripe.Event> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// Mark a user's plan after a successful checkout. For the 3-month pack, set a
// fixed pro_expires_at (now + 90 days) so getUserPlan lapses them to free
// automatically. Monthly is recurring, so pro_expires_at is left null
// (downgrade happens via customer.subscription.deleted webhook). Save the
// stripe_customer_id when it's available on the session.
export async function applyCheckoutPlan(
  userId: string,
  plan: CheckoutPlan,
  stripeCustomerId: string | null,
): Promise<void> {
  const proExpiresAt =
    plan === "pro_3month" ? new Date(Date.now() + PRO_3MONTH_DURATION_MS) : null;
  await pool.query(
    `UPDATE "user"
       SET plan = $2,
           pro_expires_at = $3,
           stripe_customer_id = COALESCE($4, stripe_customer_id)
     WHERE id = $1`,
    [userId, plan, proExpiresAt, stripeCustomerId],
  );
}

// Downgrade a customer to free (subscription deleted / cancelled).
export async function downgradeToFree(stripeCustomerId: string): Promise<void> {
  await pool.query(
    `UPDATE "user"
       SET plan = 'free',
           pro_expires_at = NULL
     WHERE stripe_customer_id = $1`,
    [stripeCustomerId],
  );
}

// Upgrade/downgrade by subscription status. status=active/trialing → keep
// pro_monthly; status=canceled/incomplete_expired/unpaid → free. Uses the
// customer id from the subscription (not every event carries a user id).
export async function syncSubscriptionStatus(
  stripeCustomerId: string,
  status: Stripe.Subscription.Status,
): Promise<void> {
  const active =
    status === "active" || status === "trialing" || status === "past_due";
  if (active) {
    await pool.query(
      `UPDATE "user"
         SET plan = 'pro_monthly',
             pro_expires_at = NULL
       WHERE stripe_customer_id = $1`,
      [stripeCustomerId],
    );
  } else {
    await downgradeToFree(stripeCustomerId);
  }
}

function origin(): string {
  // The public app URL for success/cancel redirects. Prefer BETTER_AUTH_URL
  // (already maintained per-deploy) and fall back to localhost for dev.
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  );
}