-- PRE-86: Multi-tenant auth with Better Auth.
--
-- 1. Create Better Auth's own tables (user, session, account, verification).
--    Better Auth 1.6.x's Kysely adapter queries camelCase column names by
--    default (fieldName defaults are camelCase), so we create them with
--    camelCase columns. "user" is a reserved word in Postgres and is quoted.
--
-- 2. Add a `user_id text` column to every existing single-user table, backfill
--    existing rows with the sentinel "local" user id (so local-dev data stays
--    visible when BETTER_AUTH_SECRET is unset), and re-key the four single-row
--    tables (master_resume, master_pii_map, user_settings, api_keys) on
--    user_id instead of the vestigial id=1.

-- ── Better Auth tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user" (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  emailVerified boolean NOT NULL DEFAULT false,
  image         text,
  createdAt     timestamptz NOT NULL DEFAULT now(),
  updatedAt     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id          text PRIMARY KEY,
  token       text NOT NULL UNIQUE,
  userId      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expiresAt   timestamptz NOT NULL,
  ipAddress   text,
  userAgent   text,
  createdAt   timestamptz NOT NULL DEFAULT now(),
  updatedAt   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON "session"(userId);

CREATE TABLE IF NOT EXISTS account (
  id                    text PRIMARY KEY,
  accountId             text NOT NULL,
  providerId            text NOT NULL,
  userId                text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken           text,
  refreshToken          text,
  idToken               text,
  accessTokenExpiresAt  timestamptz,
  refreshTokenExpiresAt timestamptz,
  scope                 text,
  password              text,
  createdAt             timestamptz NOT NULL DEFAULT now(),
  updatedAt             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (providerId, accountId)
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expiresAt   timestamptz NOT NULL,
  createdAt   timestamptz NOT NULL DEFAULT now(),
  updatedAt   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

-- ── Add user_id to existing tables ─────────────────────────────────────────

ALTER TABLE master_resume    ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE master_pii_map   ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE user_settings    ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE api_keys         ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE drafts           ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE resume_versions  ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE applications     ADD COLUMN IF NOT EXISTS user_id text;

-- Backfill existing rows with the local-dev sentinel so current data remains
-- visible when Better Auth isn't configured (user_id resolves to "local").
UPDATE master_resume   SET user_id = 'local' WHERE user_id IS NULL;
UPDATE master_pii_map  SET user_id = 'local' WHERE user_id IS NULL;
UPDATE user_settings   SET user_id = 'local' WHERE user_id IS NULL;
UPDATE api_keys        SET user_id = 'local' WHERE user_id IS NULL;
UPDATE drafts          SET user_id = 'local' WHERE user_id IS NULL;
UPDATE resume_versions SET user_id = 'local' WHERE user_id IS NULL;
UPDATE applications    SET user_id = 'local' WHERE user_id IS NULL;

-- ── Re-key the four single-row tables on user_id ───────────────────────────
-- Drop the vestigial id=1 PK / CHECK and make user_id the primary key. There
-- is at most one pre-existing row (id=1) per table, already backfilled above.

ALTER TABLE master_resume   DROP CONSTRAINT IF EXISTS master_resume_id_check;
ALTER TABLE master_resume   DROP CONSTRAINT IF EXISTS master_resume_pkey;
ALTER TABLE master_pii_map  DROP CONSTRAINT IF EXISTS master_pii_map_id_check;
ALTER TABLE master_pii_map  DROP CONSTRAINT IF EXISTS master_pii_map_pkey;
ALTER TABLE user_settings   DROP CONSTRAINT IF EXISTS user_settings_id_check;
ALTER TABLE user_settings   DROP CONSTRAINT IF EXISTS user_settings_pkey;
ALTER TABLE api_keys        DROP CONSTRAINT IF EXISTS api_keys_id_check;
ALTER TABLE api_keys        DROP CONSTRAINT IF EXISTS api_keys_pkey;

ALTER TABLE master_resume   DROP COLUMN IF EXISTS id;
ALTER TABLE master_pii_map  DROP COLUMN IF EXISTS id;
ALTER TABLE user_settings   DROP COLUMN IF EXISTS id;
ALTER TABLE api_keys        DROP COLUMN IF EXISTS id;

-- Re-key each single-row table on user_id (PRIMARY KEY implies uniqueness, so
-- we don't add a separate UNIQUE constraint). Guarded with DO blocks so the
-- migration is safe to re-run against an already-migrated database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_resume_pkey'
                 AND conrelid = 'master_resume'::regclass) THEN
    ALTER TABLE master_resume ADD PRIMARY KEY (user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_pii_map_pkey'
                 AND conrelid = 'master_pii_map'::regclass) THEN
    ALTER TABLE master_pii_map ADD PRIMARY KEY (user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_pkey'
                 AND conrelid = 'user_settings'::regclass) THEN
    ALTER TABLE user_settings ADD PRIMARY KEY (user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_pkey'
                 AND conrelid = 'api_keys'::regclass) THEN
    ALTER TABLE api_keys ADD PRIMARY KEY (user_id);
  END IF;
END $$;

-- ── Index the user_id column on the multi-row tables ───────────────────────

CREATE INDEX IF NOT EXISTS drafts_user_id_idx          ON drafts (user_id);
CREATE INDEX IF NOT EXISTS resume_versions_user_id_idx ON resume_versions (user_id);
CREATE INDEX IF NOT EXISTS applications_user_id_idx    ON applications (user_id);