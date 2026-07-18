-- PRE-86 followup: recreate the four Better Auth tables with quoted camelCase
-- column identifiers.
--
-- Why: Better Auth 1.6.x's Kysely adapter queries quoted camelCase column
-- names (`"accountId"`, `"userId"`, `"expiresAt"`, `"emailVerified"`). The
-- original 0008_auth.sql created the tables with UNQUOTED camelCase column
-- names, which Postgres silently folded to lowercase (`accountid`, `userid`,
-- `expiresat`, `emailverified`). Result: every Better Auth insert/lookup
-- failed with "column \"expiresAt\" of relation ... does not exist" — OAuth
-- sign-in broke at the verification-step DB write.
--
-- The four BA tables held zero rows at the time of this fix (OAuth sign-in
-- never succeeded past the verification insert), so dropping + recreating is
-- lossless. Existing data in the seven app tables (master_resume, drafts,
-- etc.) is untouched.
--
-- Idempotent: safe to re-run against an already-corrected DB (each CREATE
-- TABLE is IF NOT EXISTS, and the DROP only fires when the bad-lowercase
-- column is still present).

-- Detect the bad schema (lowercase `expiresat` on verification) and recreate.
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT count(*) INTO bad_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'verification'
    AND column_name = 'expiresat';

  IF bad_count > 0 THEN
    DROP TABLE IF EXISTS "user" CASCADE;
    DROP TABLE IF EXISTS "session" CASCADE;
    DROP TABLE IF EXISTS account CASCADE;
    DROP TABLE IF EXISTS verification CASCADE;
  END IF;
END $$;

-- (Re)create with quoted camelCase so Postgres preserves the column names.
CREATE TABLE IF NOT EXISTS "user" (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image         text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id          text PRIMARY KEY,
  token       text NOT NULL UNIQUE,
  "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");

CREATE TABLE IF NOT EXISTS account (
  id                    text PRIMARY KEY,
  "accountId"           text NOT NULL,
  "providerId"          text NOT NULL,
  "userId"              text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"         text,
  "refreshToken"        text,
  "idToken"             text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                 text,
  password             text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON account("userId");

CREATE TABLE IF NOT EXISTS verification (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON verification(identifier);