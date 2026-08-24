// Bring-your-own API key storage. Keys live in the `api_keys` table, one row
// per user (keyed on user_id). The provider factory checks these DB-stored
// keys BEFORE falling back to process.env.*_API_KEY.
//
// To avoid hitting the DB on every build() call, we cache the row in memory
// after the first read. refreshApiKeys() re-reads the DB and is invoked by the
// api-keys PUT/DELETE endpoints after a mutation, so the running server picks
// up changes without a restart.
//
// The cache is keyed by user id so multiple users in one server process don't
// bleed into each other.

import { pool } from "./db";
import type { ProviderName } from "./providers";

// The providers that can carry a user-supplied key. Mirrors the columns in
// the api_keys table.
export type KeyedProvider = Extract<ProviderName, "opencode" | "anthropic" | "openai" | "deepseek">;

export const KEYED_PROVIDERS: KeyedProvider[] = ["opencode", "anthropic", "openai", "deepseek"];

export function isKeyedProvider(name: string): name is KeyedProvider {
  return (KEYED_PROVIDERS as string[]).includes(name);
}

// Map of provider -> key (or null when unset). Null means "look at env".
export type ApiKeyMap = Record<KeyedProvider, string | null>;

function emptyMap(): ApiKeyMap {
  return { opencode: null, anthropic: null, openai: null, deepseek: null };
}

const COLUMN: Record<KeyedProvider, string> = {
  opencode: "opencode_key",
  anthropic: "anthropic_key",
  openai: "openai_key",
  deepseek: "deepseek_key",
};

// In-memory cache, keyed by user id. Entries are created on first read.
const cache = new Map<string, ApiKeyMap>();
const loaded = new Set<string>();

// Read the api_keys row for a user. Returns an empty map (all null) on any
// error — providers then fall back to env vars, so the app keeps working.
export async function loadApiKeys(userId: string): Promise<ApiKeyMap> {
  const map = emptyMap();
  try {
    const r = await pool.query("SELECT * FROM api_keys WHERE user_id = $1", [userId]);
    const row = r.rows[0];
    if (row) {
      for (const p of KEYED_PROVIDERS) {
        const v = row[COLUMN[p]];
        map[p] = typeof v === "string" && v.length > 0 ? v : null;
      }
    }
  } catch {
    // Treat a missing table / connection error as "no keys configured".
  }
  cache.set(userId, map);
  loaded.add(userId);
  return map;
}

// Re-read the DB and update the cache for a user. Called after a PUT/DELETE so
// the running server's provider factory sees the new keys without a restart.
export async function refreshApiKeys(userId: string): Promise<ApiKeyMap> {
  return loadApiKeys(userId);
}

// Return the cached key map for a user, populating it on first use. The
// provider factory reads from here (synchronously) inside build().
export function getCachedApiKeys(userId: string): ApiKeyMap {
  if (!loaded.has(userId) || !cache.has(userId)) {
    // First use in this process for this user. We can't block here (the
    // factory calls this synchronously), so fall back to env-only and trigger
    // a background load.
    cache.set(userId, emptyMap());
    loaded.add(userId);
    void loadApiKeys(userId).catch(() => {
      /* ignore — env fallback still works */
    });
  }
  return cache.get(userId)!;
}

// Ensure the API keys for a user are loaded before the first provider call.
// Call this at the start of any route that uses getProviderForFlow() to
// avoid the cold-start race where getCachedApiKeys returns an empty map
// before the background loadApiKeys() finishes.
export async function ensureApiKeysLoaded(userId: string): Promise<void> {
  if (!loaded.has(userId) || !cache.has(userId)) {
    await loadApiKeys(userId);
  }
}

// Full key map including actual values — used only server-side by the
// provider factory and the test-connection endpoint. Never exposed to the
// client; the api-keys GET endpoint uses getKeyStatus() instead.
export function getApiKey(userId: string, provider: KeyedProvider): string | null {
  return getCachedApiKeys(userId)[provider];
}

// Boolean view for clients: which keys are set, never the values themselves.
export function getKeyStatus(userId: string): Record<KeyedProvider, boolean> {
  const m = getCachedApiKeys(userId);
  return {
    opencode: m.opencode != null,
    anthropic: m.anthropic != null,
    openai: m.openai != null,
    deepseek: m.deepseek != null,
  };
}

// Resolve the key for a provider: DB first, then the env var. Used by
// build() so the precedence is centralized in one place.
export function resolveApiKey(userId: string, provider: KeyedProvider): string | undefined {
  const dbKey = getApiKey(userId, provider);
  if (dbKey) return dbKey;
  const envVar = `${provider.toUpperCase()}_API_KEY` as
    | "OPENCODE_API_KEY"
    | "ANTHROPIC_API_KEY"
    | "OPENAI_API_KEY"
    | "DEEPSEEK_API_KEY";
  return process.env[envVar];
}

// Persist one key. Empty string is treated as "clear".
export async function setApiKey(
  userId: string,
  provider: KeyedProvider,
  key: string,
): Promise<void> {
  const col = COLUMN[provider];
  const value = key.trim().length > 0 ? key.trim() : null;
  await pool.query(
    `INSERT INTO api_keys (user_id, ${col}, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now()`,
    [userId, value],
  );
  await refreshApiKeys(userId);
}

// Null out one key. Falls back to env var for the running provider factory.
export async function clearApiKey(
  userId: string,
  provider: KeyedProvider,
): Promise<void> {
  const col = COLUMN[provider];
  await pool.query(
    `UPDATE api_keys SET ${col} = NULL, updated_at = now() WHERE user_id = $1`,
    [userId],
  );
  await refreshApiKeys(userId);
}