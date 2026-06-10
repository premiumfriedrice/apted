-- Store compiled PDF alongside each tailored resume version.
-- NULL means compilation failed or hasn't happened yet (e.g. for rows
-- created before this migration).
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS pdf BYTEA;
