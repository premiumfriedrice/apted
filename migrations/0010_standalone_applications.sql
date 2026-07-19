-- Allow applications to exist without a linked resume version.
-- version_id was NOT NULL with a FK to resume_versions — now nullable
-- so users can track applications they submitted outside of apted.
ALTER TABLE applications ALTER COLUMN version_id DROP NOT NULL;
