# Handoff: Bring Your Own API Key (PRE-84)

**Branch**: `feature/byok-api-keys`
**Worktree**: `/Users/lloydalba/code/apted-byok`
**Linear**: PRE-84
**Date**: 2026-07-08

## What to Build

Allow users to bring their own LLM API keys via the settings page instead of relying on server-side environment variables only.

### 1. Migration: api_keys table

Create `migrations/0007_api_keys.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  opencode_key    text,
  anthropic_key   text,
  openai_key      text,
  deepseek_key    text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO api_keys (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

**Security note**: For a single-user app this is acceptable. If multi-user lands, keys should be encrypted at rest using a server-side encryption key. For now, store as plaintext in the DB (same as env vars are plaintext in `.env.local`). The API never returns the keys to the client — only whether they're set.

### 2. Backend: /api/settings/api-keys endpoint

Create `src/app/api/settings/api-keys/route.ts`:

- **GET**: Returns `{ opencode: boolean, anthropic: boolean, openai: boolean, deepseek: boolean }` — just whether each key is set, never the key values
- **PUT**: Accepts `{ provider: "opencode"|"anthropic"|"openai"|"deepseek", key: string }` — saves the key
- **DELETE**: Accepts `{ provider: string }` — removes the key (sets to NULL)

Also create `src/lib/api-keys.ts` with:
- `getApiKeys()`: reads all keys from DB, returns a map
- `setApiKey(provider, key)`: saves one key
- `clearApiKey(provider)`: sets one key to NULL

### 3. Backend: Provider factory reads DB keys

Modify `src/lib/providers/index.ts`:

- `getProvider()`, `getTailorProvider()`, `getStructureProvider()` should check the DB for user-stored keys BEFORE falling back to `process.env.*_API_KEY`
- This requires making the provider functions async (they currently return `Provider` synchronously)
- OR: add an initialization step that loads keys from DB at server startup and caches them
- OR: make `build()` async and have it check DB first, then env

**Recommended approach**: Add a `loadApiKeys()` function that reads from DB once and caches in memory. Call it at module load. Add a `refreshApiKeys()` function that re-reads from DB (called after PUT/DELETE on the api-keys endpoint). The `build()` function checks the cached keys first, then env.

### 4. UI: API keys section on settings page

Modify `src/app/settings/page.tsx`:

- Add a new section below "Resume template" titled "API Keys"
- For each provider (OpenCode Zen, Anthropic, OpenAI, DeepSeek):
  - Label with provider name
  - If key is set: show "✓ Key set" with a "Remove" button
  - If key is not set: show a password input with a "Save" button
  - A "Test" button that calls the provider with a minimal request to verify the key works
- Use the design system tokens (surface-container-lowest, outline-variant, etc.)
- Match the existing settings page card style

### 5. UI: Test connection button

For each provider, a "Test" button that:
- Sends a minimal API call to the provider using the stored key
- Shows "✓ Working" or "✗ Failed: <error>" inline
- For OpenCode: a simple models list call or a 1-token completion
- For Anthropic: a minimal messages API call
- For OpenAI: a minimal chat completion call
- For DeepSeek: a minimal chat completion call

This could be a new endpoint: `POST /api/settings/api-keys/test` with `{ provider: string }` that uses the stored key to make a test call.

### 6. Tests

- `src/__tests__/api/api-keys.test.ts`: Test GET/PUT/DELETE on the api-keys endpoint
- Test that GET never returns actual key values
- Test that provider factory uses DB keys over env vars
- Test that clearing a key falls back to env var

## Current State

### Settings page (`src/app/settings/page.tsx`)
- Simple page with template radio buttons and a Save button
- Uses old styling (not yet reskinned to match the new design system)
- No API key management

### Settings API (`src/app/api/settings/route.ts`)
- GET returns template + options
- PUT saves template only

### Settings lib (`src/lib/settings.ts`)
- `getUserSettings()`: reads template from `user_settings` table
- `setUserSettings()`: saves template

### Provider factory (`src/lib/providers/index.ts`)
- `getProvider(name)`: builds a provider from env vars
- `getProviderForFlow(flow)`: routes flows to providers
- `getTailorProvider()`: returns OpenCode Sonnet or Anthropic fallback
- `getStructureProvider()`: returns OpenCode DeepSeek or DeepSeek direct or Anthropic fallback
- All keys read from `process.env.*_API_KEY`

### Database
- `user_settings` table: single row (id=1), has `template` column
- No api_keys table yet

## Key Files

- `src/app/settings/page.tsx` — settings UI (add API keys section here)
- `src/app/api/settings/route.ts` — settings API (extend or add sibling route)
- `src/lib/settings.ts` — settings read/write (add api-keys.ts alongside)
- `src/lib/providers/index.ts` — provider factory (modify to read DB keys)
- `migrations/` — add 0007_api_keys.sql
- `docs/design.md` — design system reference for styling the new UI section

## Testing

```bash
cd /Users/lloydalba/code/apted-byok
npm run db:migrate          # run the new migration
npx vitest run              # all tests must pass
npx tsc --noEmit            # type check must pass
npm run dev                 # visual check: settings page with API keys section
```

## Out of Scope

- Encrypting keys at rest (single-user app, plaintext in DB is same security level as env vars)
- Multi-user key management
- Changing the extension to use user-provided keys (extension uses server-side keys via the web app API)
- Reskinning the entire settings page (just add the API keys section)