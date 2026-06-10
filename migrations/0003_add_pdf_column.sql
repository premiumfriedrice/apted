-- Add compiled PDF storage to resume_versions so the library can show
-- PDF cards without recompiling every version on page load.
ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS pdf BYTEA;
