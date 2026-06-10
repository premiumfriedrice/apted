-- Stores the redaction map for master_resume so PII can be injected
-- back for rendering (PDF, .tex, display). One row per master (id=1
-- enforced, same as master_resume).
CREATE TABLE IF NOT EXISTS master_pii_map (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  map         jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
