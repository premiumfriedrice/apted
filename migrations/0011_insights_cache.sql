-- Cache table for AI-generated resume insights (PRE-88).
-- Insights are expensive (an LLM call), so persist them per resume version +
-- user. The cache is invalidated (row deleted) whenever the version's
-- tailored_content changes, so stale insights never survive an edit.
CREATE TABLE IF NOT EXISTS resume_insights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  summary     text NOT NULL,
  keywords    jsonb NOT NULL DEFAULT '[]',
  strengths   jsonb NOT NULL DEFAULT '[]',
  tone        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resume_insights_version_user_idx
  ON resume_insights (version_id, user_id);