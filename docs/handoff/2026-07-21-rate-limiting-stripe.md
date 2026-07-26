# Handoff: Rate Limiting, Upgrade Plan, and Stripe Payments (PRE-93)

**Branch**: `feature/rate-limiting-stripe`
**Worktree**: `/Users/lloydalba/code/apted-stripe`
**Linear**: PRE-93
**Date**: 2026-07-21

## Pricing Structure

- **Free Trial (3 days, starts on signup)**: Unlimited everything. No credit card required. Expires automatically.
- **Free (after trial)**: 3 tailor sessions/month. Edits, generate-bullets, extracts all unlimited. Can view/manage existing resumes and applications.
- **Monthly ($9.99/mo)**: Unlimited everything. Recurring subscription, cancel via Stripe Customer Portal.
- **3-Month Pack ($24.99 one-time)**: Unlimited everything for 90 days. No recurring billing. Targets recruiting season (July-October). After 90 days, drops back to Free.

## Rate Limiting Design

The **tailored resume session** is the unit of value. A user clicks "Tailor Resume," gets a draft, refines it as much as they want via chat, saves it. That's one session.

- Only `/api/tailor` checks the rate limit. Everything else (edit, generate-bullets, extract) is unlimited.
- Free tier: 3 tailor sessions per calendar month. Reset on the 1st of each month.
- Trial and Pro: no limit on tailors.

### Implementation

**New migration `0012_plans.sql`:**
```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'trial';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan_started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE TABLE IF NOT EXISTS usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  flow        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_user_flow_created_idx
  ON usage_events (user_id, flow, created_at DESC);
```

**New `src/lib/plans.ts`:**
- Plan type: `'trial' | 'free' | 'pro_monthly' | 'pro_3month'`
- `TRIAL_DURATION_DAYS = 3`
- `PRO_3MONTH_DURATION_DAYS = 90`
- `FREE_TAILOR_LIMIT = 3`
- `getUserPlan(userId)`: reads plan, plan_started_at, pro_expires_at from user table. If trial and >3 days since plan_started_at, returns 'free'. If pro and pro_expires_at < now, returns 'free'.
- `isProOrTrial(plan)`: returns true for trial, pro_monthly, pro_3month

**New `src/lib/rate-limit.ts`:**
- `checkTailorLimit(userId)`: 
  1. Get user's effective plan (via getUserPlan)
  2. If trial or pro: return `{ allowed: true, remaining: Infinity, limit: Infinity }`
  3. If free: count usage_events this month for flow='tailor'. If < 3: allowed. Else: denied.
  4. Returns `{ allowed: boolean, remaining: number, limit: number }`
- `recordUsage(userId, flow)`: inserts a row into usage_events. Called AFTER the LLM call succeeds (not on 429).
- `getMonthlyUsage(userId)`: returns counts for the current month, used by the upgrade page and dashboard.

**Modify `/api/tailor/route.ts`:**
- At the start: call `checkTailorLimit(userId)`. If not allowed, return 429 with `{ error: 'rate_limit_exceeded', limit: 3, remaining: 0 }`.
- After successful tailor: call `recordUsage(userId, 'tailor')`.

**No changes needed to:** `/api/edit`, `/api/master/generate-bullets`, `/api/extract` — these are unlimited.

## Upgrade Plan Page

**New `/upgrade` page:**
- Shows current plan and trial status
- If on trial: shows countdown "X days left in your free trial"
- If free: shows "Upgrade" CTAs
- Two pricing cards:
  - Monthly: $9.99/mo, "Cancel anytime", "Upgrade" button → Stripe Checkout (subscription)
  - 3-Month Pack: $24.99, "90 days of full access", "Best for recruiting season" badge, "Buy now" button → Stripe Checkout (one-time payment)
- If on Pro: shows "Manage subscription" button → Stripe Customer Portal
- Shows free tier limits: "3 tailored resumes per month" with current usage

**New `src/app/api/usage/route.ts`:**
- GET: returns `{ plan, trialDaysLeft, tailorUsed, tailorLimit, proExpiresAt }`

## Stripe Integration

**Setup:**
- `npm install stripe @stripe/stripe-js`
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_3MONTH_PRICE_ID`
- Two Stripe products:
  - Monthly subscription: $9.99/mo recurring
  - One-time payment: $24.99 for 90-day access

**Endpoints:**
- `POST /api/stripe/checkout` — creates Stripe Checkout session. Body: `{ plan: 'pro_monthly' | 'pro_3month' }`. Returns `{ url }`. Creates/reuses Stripe customer ID on user table.
- `POST /api/stripe/portal` — creates Stripe Customer Portal session for managing/canceling subscriptions. Returns `{ url }`.
- `POST /api/stripe/webhook` — receives Stripe webhooks. Handles:
  - `checkout.session.completed` — set plan to `pro_monthly` or `pro_3month` based on which product was purchased. Set `pro_expires_at` (now + 90 days for 3-month pack; null for monthly since it's recurring). Save `stripe_customer_id`.
  - `customer.subscription.deleted` — downgrade to `free`
  - `customer.subscription.updated` — check status, upgrade/downgrade
  - Must be excluded from middleware auth check (raw body verification)

**New `src/lib/stripe.ts`:** Stripe client init + helpers (createCheckoutSession, createPortalSession, handleWebhook)

## AppShell Updates

- "Upgrade plan" link → `/upgrade`
- If user is on Pro: show "Manage subscription" instead, linking to `/api/stripe/portal`
- Show plan badge next to user name in profile footer ("Trial", "Free", "Pro")
- Trial users see "X days left" badge

## Database Changes

See migration above. Summary:
- `user` table: add `plan`, `plan_started_at`, `pro_expires_at`, `stripe_customer_id`
- New `usage_events` table for tracking tailor sessions

## Env Vars

Add to `.env.example`:
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_3MONTH_PRICE_ID=
```

## Key Files

- `migrations/0012_plans.sql` — NEW
- `src/lib/plans.ts` — NEW: plan definitions, trial logic, getUserPlan
- `src/lib/rate-limit.ts` — NEW: checkTailorLimit, recordUsage, getMonthlyUsage
- `src/lib/stripe.ts` — NEW: Stripe client + helpers
- `src/app/upgrade/page.tsx` — NEW: upgrade page
- `src/app/api/usage/route.ts` — NEW: usage stats endpoint
- `src/app/api/stripe/checkout/route.ts` — NEW
- `src/app/api/stripe/portal/route.ts` — NEW
- `src/app/api/stripe/webhook/route.ts` — NEW
- `src/app/api/tailor/route.ts` — modify: add rate limit check + record usage
- `src/middleware.ts` — modify: exclude `/api/stripe/webhook` from auth
- `src/components/AppShell.tsx` — modify: upgrade link, plan badge, trial countdown
- `.env.example` — add Stripe env vars

## Testing

```bash
cd /Users/lloydalba/code/apted-stripe
npm install stripe @stripe-stripe-js
npm run db:migrate
npx vitest run
npx tsc --noEmit
npm run build
npm run dev  # test upgrade page, rate limiting (need Stripe test keys)
```

## Out of Scope

- Annual billing
- Multiple Pro tiers
- Usage-based pricing
- Stripe Tax
- Team plans
- Proration logic (Stripe handles this)
