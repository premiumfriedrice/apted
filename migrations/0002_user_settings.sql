-- Per-user settings. Single-user app, so we enforce a single row at id=1
-- just like master_resume. When/if auth lands, add a user_id column and drop
-- the id=1 constraint.
CREATE TABLE IF NOT EXISTS user_settings (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  template    text NOT NULL DEFAULT 'jake',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row if not present.
INSERT INTO user_settings (id, template)
VALUES (1, 'jake')
ON CONFLICT (id) DO NOTHING;
