-- Split resume_versions into content-only versions and per-job applications.

-- Application of a saved resume version to a specific job.
CREATE TABLE IF NOT EXISTS applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  company         text NOT NULL,
  role            text NOT NULL,
  job_description text NOT NULL,
  outcome         outcome NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_version_id_idx ON applications (version_id);
CREATE INDEX IF NOT EXISTS applications_outcome_idx    ON applications (outcome);
CREATE INDEX IF NOT EXISTS applications_created_idx    ON applications (created_at DESC);

-- Migrate existing resume_versions rows into applications.
INSERT INTO applications (version_id, company, role, job_description, outcome, created_at)
SELECT id, company, role, job_description, outcome, created_at
FROM resume_versions;

-- Remove job-specific columns from resume_versions now stored on applications.
ALTER TABLE resume_versions
  DROP COLUMN company,
  DROP COLUMN role,
  DROP COLUMN job_description,
  DROP COLUMN outcome;
