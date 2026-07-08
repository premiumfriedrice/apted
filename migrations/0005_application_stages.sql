-- Extend application outcomes to support a full interview funnel.

-- Add the new terminal/phase values to the existing enum.
ALTER TYPE outcome ADD VALUE IF NOT EXISTS 'ghosted';
ALTER TYPE outcome ADD VALUE IF NOT EXISTS 'interviewing';
ALTER TYPE outcome ADD VALUE IF NOT EXISTS 'declined';

-- Track which interview round an application is currently in (if any).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interview_round int,
  ADD COLUMN IF NOT EXISTS rejected_after_round int;

-- Migrate existing data to the new model.
-- 'interview' becomes 'interviewing' at round 1.
-- 'rejected' becomes rejected after the applied stage (round 0).
UPDATE applications
SET outcome = 'interviewing', interview_round = 1
WHERE outcome = 'interview';

UPDATE applications
SET rejected_after_round = 0
WHERE outcome = 'rejected';

-- Ensure data consistency: interviewing rows must have a round.
UPDATE applications
SET interview_round = 1
WHERE outcome = 'interviewing' AND interview_round IS NULL;

-- Add a simple check: interviewing rows require a round >= 1.
ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_interview_round_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_interview_round_check
    CHECK (outcome <> 'interviewing' OR (interview_round IS NOT NULL AND interview_round >= 1));
