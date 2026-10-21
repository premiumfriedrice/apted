-- Event-first application writes (PRE-88): stable per-ATS identity
-- ("trackedObj", e.g. greenhouse:stripe/4021853) for extension captures.
-- Enables server-side dedupe and later upgrades of partial captures.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tracked_obj text;

CREATE UNIQUE INDEX IF NOT EXISTS applications_user_tracked_obj_key
  ON applications (user_id, tracked_obj) WHERE tracked_obj IS NOT NULL;
