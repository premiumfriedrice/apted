# Handoff: Rate Limiting, Upgrade Plan, and Stripe Payments (PRE-93)

**Branch**: `feature/rate-limiting-stripe`
**Worktree**: `/Users/lloydalba/code/apted-stripe`
**Linear**: PRE-93
**Date**: 2026-07-21

## What to Build

Three interconnected features: rate limiting per user/plan, an upgrade plan page, and Stripe integration for payments.

### 1. Rate Limiting

Limit API usage based on the user's plan tier. Free tier gets a limited number of LLM calls per month; Pro tier gets unlimited (or a much higher cap).

**Plan tiers:**
- **Free**: 10 tailors/month, 20 edits/month, 5 generate-bullets/month
- **Pro** ($9/mo): Unlimited tailors, edits, generate-bullets

**Implementation:**
- New migration `0012_plans.sql`: add `plan` column to the `user` table (Better Auth). Values: `free` (default), `pro`. Add `stripe_customer_id` and `stripe_subscription_id` columns.
- New table `usage_events`: tracks each LLM call with `user_id`, `flow` (tailor/edit/generate-bullets/extract), `created_at`. Used to count monthly usage.
- New `src/lib/rate-limit.ts`: `checkRateLimit(userId, flow)` — counts usage in the current month, returns `{ allowed: boolean, remaining: number, limit: number }`. Called at the start of each LLM-heavy API route.
- API routes that call LLMs (`/api/tailor`, `/api/edit`, `/api/master/generate-bullets`, `/api/extract`) check the rate limit before proceeding. Return 429 with `{ error: "rate_limit_exceeded", limit, remaining, resetAt }` when exceeded.
- The rate limit check increments the usage counter only when the LLM call actually succeeds (not on 429 responses).

**Files to modify:**
- `src/app/api/tailor/route.ts` — add rate limit check
- `src/app/api/edit/route.ts` — add rate limit check
- `src/app/api/master/generate-bullets/route.ts` — add rate limit check
- `src/app/api/extract/route.ts` — add rate limit check

**New files:**
- `migrations/0012_plans.sql`
- `src/lib/rate-limit.ts`
- `src/lib/plans.ts` — plan definitions, limits, helper to get user's plan

### 2. Upgrade Plan Page

A new `/upgrade` page showing the pricing tiers and a CTA to subscribe via Stripe.

**Page content:**
- Two plan cards: Free and Pro
- Free: shows current usage (tailors used X/10, edits used X/20, etc.)
- Pro: features list (unlimited tailors, unlimited edits, priority compile, etc.), price $9/mo, "Upgrade to Pro" button
- Button triggers Stripe Checkout

**Files:**
- `src/app/upgrade/page.tsx` — NEW: upgrade page
- `src/app/api/usage/route.ts` — NEW: GET returns current month's usage counts for the user
- Update `src/components/AppShell.tsx`: "Upgrade plan" link in profile menu now goes to `/upgrade`

### 3. Stripe Integration

**Setup:**
- `npm install stripe @stripe/stripe-js`
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (for the Pro monthly price)
- Add to `.env.example`

**Endpoints:**
- `POST /api/stripe/checkout` — creates a Stripe Checkout session for Pro subscription. Requires authenticated user. Returns `{ url }` for redirect. Creates/reuses Stripe customer ID.
- `POST /api/stripe/portal` — creates a Stripe Customer Portal session for managing subscriptions (cancel, update payment). Returns `{ url }`.
- `POST /api/stripe/webhook` — receives Stripe webhooks. Handles:
  - `checkout.session.completed` — update user's plan to `pro`, save stripe IDs
  - `customer.subscription.deleted` — downgrade user's plan to `free`
  - `customer.subscription.updated` — check status, upgrade/downgrade accordingly

**Webhook security:**
- Verify Stripe signature using `STRIPE_WEBHOOK_SECRET`
- This endpoint must NOT go through the middleware auth check (Stripe sends raw body). Add `/api/stripe/webhook` to the middleware exclusion list.

**Files:**
- `src/app/api/stripe/checkout/route.ts` — NEW
- `src/app/api/stripe/portal/route.ts` — NEW
- `src/app/api/stripe/webhook/route.ts` — NEW
- `src/lib/stripe.ts` — NEW: Stripe client init + helper functions
- `src/middleware.ts` — exclude `/api/stripe/webhook` from auth check

### 4. Database Changes

`migrations/0012_plans.sql`:
```sql
-- Add plan and Stripe fields to the Better Auth user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Track LLM usage for rate limiting
CREATE TABLE IF NOT EXISTS usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  flow        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_user_flow_created_idx
  ON usage_events (user_id, flow, created_at DESC);
```

### 5. Update AppShell Profile Menu

- "Upgrade plan" link → `/upgrade`
- If user is on Pro, show "Manage subscription" instead, linking to Stripe portal via `/api/stripe/portal`
- Show plan badge next to user name in profile footer

## Current State

- No rate limiting exists
- No Stripe integration
- `user` table has no plan/tier column
- AppShell profile menu has "Upgrade plan" link that goes nowhere
- `displayTier` shows the user's email, not their plan

## Key Files

- `migrations/0012_plans.sql` — NEW: plans + usage tracking
- `src/lib/plans.ts` — NEW: plan definitions and limits
- `src/lib/rate-limit.ts` — NEW: rate limit checking
- `src/lib/stripe.ts` — NEW: Stripe client
- `src/app/upgrade/page.tsx` — NEW: upgrade page
- `src/app/api/stripe/checkout/route.ts` — NEW
- `src/app/api/stripe/portal/route.ts` — NEW
- `src/app/api/stripe/webhook/route.ts` — NEW
- `src/app/api/usage/route.ts` — NEW: usage stats
- `src/app/api/tailor/route.ts` — modify: add rate limit
- `src/app/api/edit/route.ts` — modify: add rate limit
- `src/app/api/master/generate-bullets/route.ts` — modify: add rate limit
- `src/app/api/extract/route.ts` — modify: add rate limit
- `src/middleware.ts` — modify: exclude webhook from auth
- `src/components/AppShell.tsx` — modify: upgrade link, plan badge
- `.env.example` — add Stripe env vars

## Testing

```bash
cd /Users/lloydalba/code/apted-stripe
npm install stripe @stripe/stripe-js
npm run db:migrate
npx vitest run
npx tsc --noEmit
npm run build
npm run dev  # test upgrade page, rate limiting (will need Stripe test keys)
```

## Out of Scope

- Annual billing (monthly only for now)
- Multiple Pro tiers (just Free and Pro)
- Usage-based pricing (flat $9/mo)
- Stripe Tax
- Invoicing
- Team plans
