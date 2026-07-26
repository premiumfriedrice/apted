-- PRE-93: Plans, rate limiting, and Stripe payments.
--
-- Adds the per-user plan columns used by src/lib/plans.ts to compute the
-- effective plan (trial → free after 3 days; pro → free after expiry), and a
-- usage_events table that records one row per metered flow (currently only
-- 'tailor'). Rate limiting counts rows in the current calendar month.
--
-- The "user" table is Better Auth's (quoted, PK id text). The new columns are
-- unquoted lowercase (not camelCase) so no quoting is required.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan             text        NOT NULL DEFAULT 'trial';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan_started_at  timestamptz NOT NULL DEFAULT now();
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS pro_expires_at    timestamptz;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE TABLE IF NOT EXISTS usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  flow        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_user_flow_created_idx
  ON usage_events (user_id, flow, created_at DESC);