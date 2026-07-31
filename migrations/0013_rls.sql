-- Secure RLS setup: per-user access control at the database level.
--
-- The app connects as the `apted_app` role (non-superuser) and sets
-- the current user ID via SET LOCAL before each transaction.
-- RLS policies compare current_setting('app.user_id') against the
-- user_id column on each table.
--
-- This is defense-in-depth: the app layer (Better Auth + requireUserId)
-- still scopes queries by user_id, but even if a bug leaks another user's
-- ID into a query, RLS blocks the actual row access.

-- ── 1. Create the application role (non-superuser) ──────────────────────
-- Skip if it already exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apted_app') THEN
    CREATE ROLE apted_app LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
  END IF;
END $$;

-- Grant schema and table privileges to the app role.
GRANT USAGE ON SCHEMA public TO apted_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apted_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apted_app;

-- Ensure future tables (from migrations) also get these privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apted_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO apted_app;

-- ── 2. Enable RLS on all tables ─────────────────────────────────────────

-- Better Auth tables
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;

-- App tables
ALTER TABLE public.master_resume ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_pii_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_insights ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS Policies ─────────────────────────────────────────────────────
-- The app sets app.user_id via SET LOCAL at the start of each request.
-- Policies compare current_setting('app.user_id') against user_id columns.
-- The "user" table uses "id" instead of "user_id", so we special-case it.

-- Helper: the "user" table (Better Auth) uses "id" as the user identifier.
-- The session table uses "userId". Account uses "userId". Verification uses "identifier".

-- ── user table: only the current user can read/update their own row ──────
DROP POLICY IF EXISTS user_self_select ON public."user";
CREATE POLICY user_self_select ON public."user"
  FOR SELECT TO apted_app
  USING (id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS user_self_update ON public."user";
CREATE POLICY user_self_update ON public."user"
  FOR UPDATE TO apted_app
  USING (id = current_setting('app.user_id', true))
  WITH CHECK (id = current_setting('app.user_id', true));

-- ── session table: only sessions for the current user ───────────────────
DROP POLICY IF EXISTS session_user_select ON public."session";
CREATE POLICY session_user_select ON public."session"
  FOR SELECT TO apted_app
  USING ("userId" = current_setting('app.user_id', true));

DROP POLICY IF EXISTS session_user_delete ON public."session";
CREATE POLICY session_user_delete ON public."session"
  FOR DELETE TO apted_app
  USING ("userId" = current_setting('app.user_id', true));

-- ── account table: only accounts for the current user ──────────────────
DROP POLICY IF EXISTS account_user_select ON public."account";
CREATE POLICY account_user_select ON public."account"
  FOR SELECT TO apted_app
  USING ("userId" = current_setting('app.user_id', true));

-- ── verification table: only verifications for the current user ─────────
DROP POLICY IF EXISTS verification_user_select ON public."verification";
CREATE POLICY verification_user_select ON public."verification"
  FOR SELECT TO apted_app
  USING (identifier = current_setting('app.user_id', true));

-- ── App tables with user_id column: standard pattern ────────────────────

-- master_resume (PK is user_id, one row per user)
DROP POLICY IF EXISTS master_resume_user_select ON public.master_resume;
CREATE POLICY master_resume_user_select ON public.master_resume
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS master_resume_user_insert ON public.master_resume;
CREATE POLICY master_resume_user_insert ON public.master_resume
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS master_resume_user_update ON public.master_resume;
CREATE POLICY master_resume_user_update ON public.master_resume
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS master_resume_user_delete ON public.master_resume;
CREATE POLICY master_resume_user_delete ON public.master_resume
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- master_pii_map (PK is user_id, one row per user)
DROP POLICY IF EXISTS master_pii_map_user_select ON public.master_pii_map;
CREATE POLICY master_pii_map_user_select ON public.master_pii_map
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS master_pii_map_user_insert ON public.master_pii_map;
CREATE POLICY master_pii_map_user_insert ON public.master_pii_map
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS master_pii_map_user_update ON public.master_pii_map;
CREATE POLICY master_pii_map_user_update ON public.master_pii_map
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS master_pii_map_user_delete ON public.master_pii_map;
CREATE POLICY master_pii_map_user_delete ON public.master_pii_map
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- user_settings (PK is user_id, one row per user)
DROP POLICY IF EXISTS user_settings_user_select ON public.user_settings;
CREATE POLICY user_settings_user_select ON public.user_settings
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS user_settings_user_insert ON public.user_settings;
CREATE POLICY user_settings_user_insert ON public.user_settings
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS user_settings_user_update ON public.user_settings;
CREATE POLICY user_settings_user_update ON public.user_settings
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- api_keys (PK is user_id, one row per user)
DROP POLICY IF EXISTS api_keys_user_select ON public.api_keys;
CREATE POLICY api_keys_user_select ON public.api_keys
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS api_keys_user_insert ON public.api_keys;
CREATE POLICY api_keys_user_insert ON public.api_keys
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS api_keys_user_update ON public.api_keys;
CREATE POLICY api_keys_user_update ON public.api_keys
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS api_keys_user_delete ON public.api_keys;
CREATE POLICY api_keys_user_delete ON public.api_keys
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- drafts (uuid PK, has user_id)
DROP POLICY IF EXISTS drafts_user_select ON public.drafts;
CREATE POLICY drafts_user_select ON public.drafts
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS drafts_user_insert ON public.drafts;
CREATE POLICY drafts_user_insert ON public.drafts
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS drafts_user_update ON public.drafts;
CREATE POLICY drafts_user_update ON public.drafts
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS drafts_user_delete ON public.drafts;
CREATE POLICY drafts_user_delete ON public.drafts
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- resume_versions (uuid PK, has user_id)
DROP POLICY IF EXISTS resume_versions_user_select ON public.resume_versions;
CREATE POLICY resume_versions_user_select ON public.resume_versions
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS resume_versions_user_insert ON public.resume_versions;
CREATE POLICY resume_versions_user_insert ON public.resume_versions
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS resume_versions_user_update ON public.resume_versions;
CREATE POLICY resume_versions_user_update ON public.resume_versions
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS resume_versions_user_delete ON public.resume_versions;
CREATE POLICY resume_versions_user_delete ON public.resume_versions
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- applications (uuid PK, has user_id)
DROP POLICY IF EXISTS applications_user_select ON public.applications;
CREATE POLICY applications_user_select ON public.applications
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS applications_user_insert ON public.applications;
CREATE POLICY applications_user_insert ON public.applications
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS applications_user_update ON public.applications;
CREATE POLICY applications_user_update ON public.applications
  FOR UPDATE TO apted_app
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS applications_user_delete ON public.applications;
CREATE POLICY applications_user_delete ON public.applications
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- usage_events (uuid PK, has user_id)
DROP POLICY IF EXISTS usage_events_user_select ON public.usage_events;
CREATE POLICY usage_events_user_select ON public.usage_events
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS usage_events_user_insert ON public.usage_events;
CREATE POLICY usage_events_user_insert ON public.usage_events
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS usage_events_user_delete ON public.usage_events;
CREATE POLICY usage_events_user_delete ON public.usage_events
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));

-- resume_insights (uuid PK, has user_id)
DROP POLICY IF EXISTS resume_insights_user_select ON public.resume_insights;
CREATE POLICY resume_insights_user_select ON public.resume_insights
  FOR SELECT TO apted_app USING (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS resume_insights_user_insert ON public.resume_insights;
CREATE POLICY resume_insights_user_insert ON public.resume_insights
  FOR INSERT TO apted_app WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS resume_insights_user_delete ON public.resume_insights;
CREATE POLICY resume_insights_user_delete ON public.resume_insights
  FOR DELETE TO apted_app USING (user_id = current_setting('app.user_id', true));