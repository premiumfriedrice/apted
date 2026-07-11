-- Bring-your-own API keys. Single-user app, so a single row at id=1, just
-- like user_settings. Keys are stored as plaintext — the same security level
-- as env vars in .env.local. If multi-user lands, encrypt at rest with a
-- server-side key and add a user_id column (drop the id=1 constraint).
CREATE TABLE IF NOT EXISTS api_keys (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  opencode_key    text,
  anthropic_key   text,
  openai_key      text,
  deepseek_key    text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row if not present.
INSERT INTO api_keys (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;