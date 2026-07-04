-- Add a human-readable name to each resume version.
ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS name text;

-- Backfill existing versions with a default name based on creation date.
UPDATE resume_versions
SET name = 'Version from ' || to_char(created_at, 'YYYY-MM-DD')
WHERE name IS NULL OR name = '';
