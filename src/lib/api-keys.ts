// Bring-your-own API key storage. Keys live in the `api_keys` table (single
// row, id=1 — same pattern as user_settings). The provider factory checks
// these DB-stored keys BEFORE falling back to process.env.*_API_KEY.
//
// To avoid hitting the DB on every build() call, we cache the row in memory
// after the first read. refreshApiKeys() re-reads the DB and is invoked by the
// api-keys PUT/DELETE endpoints after a mutation, so the running server picks
// up changes without a restart.

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

// In-memory cache. null until the first read populates it.
let cache: ApiKeyMap | null = null;
let loaded = false;

// Read the api_keys row straight from the pool. Returns an empty map (all
// null) on any error — providers then fall back to env vars, so the app keeps
// working even if the migration hasn't run yet on a stale env.
export async function loadApiKeys(): Promise<ApiKeyMap> {
  const map = emptyMap();
  try {
    const r = await pool.query("SELECT * FROM api_keys WHERE id = 1");
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
  cache = map;
  loaded = true;
  return map;
}

// Re-read the DB and update the cache. Called after a PUT/DELETE so the running
// server's provider factory sees the new keys without a restart.
export async function refreshApiKeys(): Promise<ApiKeyMap> {
  return loadApiKeys();
}

// Return the cached key map, populating it on first use. The provider factory
// reads from here (synchronously) inside build().
export function getCachedApiKeys(): ApiKeyMap {
  if (!loaded || !cache) {
    // First use in this process. We can't block here (the factory calls this
    // synchronously), so fall back to env-only and trigger a background load.
    cache = emptyMap();
    loaded = true;
    void loadApiKeys().catch(() => {
      /* ignore — env fallback still works */
    });
  }
  return cache;
}

// Full key map including actual values — used only server-side by the
// provider factory and the test-connection endpoint. Never exposed to the
// client; the api-keys GET endpoint uses getKeyStatus() instead.
export function getApiKey(provider: KeyedProvider): string | null {
  return getCachedApiKeys()[provider];
}

// Boolean view for clients: which keys are set, never the values themselves.
export function getKeyStatus(): Record<KeyedProvider, boolean> {
  const m = getCachedApiKeys();
  return {
    opencode: m.opencode != null,
    anthropic: m.anthropic != null,
    openai: m.openai != null,
    deepseek: m.deepseek != null,
  };
}

// Resolve the key for a provider: DB first, then the env var. Used by
// build() so the precedence is centralized in one place.
export function resolveApiKey(provider: KeyedProvider): string | undefined {
  const dbKey = getApiKey(provider);
  if (dbKey) return dbKey;
  const envVar = `${provider.toUpperCase()}_API_KEY` as
    | "OPENCODE_API_KEY"
    | "ANTHROPIC_API_KEY"
    | "OPENAI_API_KEY"
    | "DEEPSEEK_API_KEY";
  return process.env[envVar];
}

// Persist one key. Empty string is treated as "clear".
export async function setApiKey(provider: KeyedProvider, key: string): Promise<void> {
  const col = COLUMN[provider];
  const value = key.trim().length > 0 ? key.trim() : null;
  await pool.query(
    `INSERT INTO api_keys (id, ${col}, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now()`,
    [value],
  );
  await refreshApiKeys();
}

// Null out one key. Falls back to env var for the running provider factory.
export async function clearApiKey(provider: KeyedProvider): Promise<void> {
  const col = COLUMN[provider];
  await pool.query(
    `UPDATE api_keys SET ${col} = NULL, updated_at = now() WHERE id = 1`,
  );
  await refreshApiKeys();
}