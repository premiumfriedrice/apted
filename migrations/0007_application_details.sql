-- Add portal URL and freeform notes to each application (PRE-85).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS portal_url text,
  ADD COLUMN IF NOT EXISTS notes text;