-- Outcome of a saved application.
DO $$ BEGIN
  CREATE TYPE outcome AS ENUM ('draft', 'applied', 'interview', 'offer', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Single canonical record. Enforced single-row by id=1.
CREATE TABLE IF NOT EXISTS master_resume (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content     jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Saved tailored resumes, indexed by company/role/outcome.
CREATE TABLE IF NOT EXISTS resume_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company            text NOT NULL,
  role               text NOT NULL,
  job_description    text NOT NULL,
  tailored_content   jsonb NOT NULL,
  outcome            outcome NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resume_versions_outcome_idx   ON resume_versions (outcome);
CREATE INDEX IF NOT EXISTS resume_versions_created_idx   ON resume_versions (created_at DESC);

-- Live working draft for the builder. The draft IS the accumulated state.
-- `history` is a stack of prior draft JSONs for undo.
CREATE TABLE IF NOT EXISTS drafts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_description    text NOT NULL,
  content            jsonb NOT NULL,
  history            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
