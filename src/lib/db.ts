import pg from "pg";

const { Pool } = pg;

// Strip ssl-related params from the URL so pg's URL parser doesn't override
// our explicit `ssl` config. Recent pg versions treat `sslmode=require` as
// verify-full, which breaks against Supabase's pooler cert chain.
export function strippedUrl(u: string): string {
  try {
    const x = new URL(u);
    x.searchParams.delete("sslmode");
    x.searchParams.delete("ssl");
    return x.toString();
  } catch {
    return u;
  }
}

// Local dev servers (localhost/127.0.0.1) don't speak SSL — only apply the
// Supabase pooler SSL workaround to remote hosts.
export function sslFor(u: string): boolean | { rejectUnauthorized: boolean } {
  try {
    const host = new URL(u).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return false;
    }
  } catch {
    // fall through to SSL
  }
  return { rejectUnauthorized: false };
}

// Create a Pool from DATABASE_URL (superuser). Used by scripts that need
// DDL access: migrate, seed, benchmark. This role bypasses RLS.
export function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new Pool({
    connectionString: strippedUrl(url),
    ssl: sslFor(url),
  });
}

// ── Runtime pool (app role, RLS-enforced) ─────────────────────────────────
//
// API routes use this pool. It connects as the apted_app role (non-superuser)
// so RLS policies are enforced. When DATABASE_URL_APP is set, we use it.
// When it's not set (local dev, migrations, tests), we fall back to
// DATABASE_URL (superuser) which bypasses RLS.

const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!appUrl) {
  console.warn("DATABASE_URL not set");
}

export const pool = new Pool({
  connectionString: appUrl ? strippedUrl(appUrl) : "",
  ssl: appUrl ? sslFor(appUrl) : undefined,
});

// True when the pool is using the non-superuser apted_app role (RLS enforced).
export const rlsEnabled = !!process.env.DATABASE_URL_APP;

// ── RLS-aware query helpers ──────────────────────────────────────────────
//
// The core problem: pool.query() borrows a random connection per call. SET
// LOCAL only lasts for the current transaction on that one connection. So
// multiple pool.query() calls in a route may hit different connections, and
// the RLS setting won't be present on all of them.
//
// Solution: withRls() borrows a single client, starts a transaction, sets
// the RLS user ID, and returns a query function that runs on that same
// client. The caller calls all queries via the returned `query` function,
// then calls `done()` to commit and release.

export interface RlsClient {
  query: typeof pool.query;
  done: () => Promise<void>;
}

// Borrow a client, set RLS user, return a query function + done callback.
// Use this when a route needs multiple queries scoped to the same RLS user.
//
// Usage:
//   const { query, done } = await withRls(userId);
//   const r = await query("SELECT ... WHERE user_id = $1", [userId]);
//   await done(); // commits + releases
export async function withRls(userId: string): Promise<RlsClient> {
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  return {
    query: client.query.bind(client) as typeof pool.query,
    done: async () => {
      try {
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    },
  };
}

// withDb: borrow a client, optionally set RLS user, run fn, release.
// For routes that already use withDb(fn, userId).
export async function withDb<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  userId?: string,
): Promise<T> {
  const client = await pool.connect();
  try {
    if (userId) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    }
    const result = await fn(client);
    if (userId) {
      await client.query("COMMIT");
    }
    return result;
  } catch (e) {
    if (userId) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw e;
  } finally {
    client.release();
  }
}

// Set the RLS user ID on a raw pool client (for routes that manage their
// own client lifecycle via pool.connect()).
export async function setRlsUser(client: pg.PoolClient, userId: string): Promise<void> {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

// Commit and release a client that was used with setRlsUser.
export async function commitRls(client: pg.PoolClient): Promise<void> {
  await client.query("COMMIT");
}

// ── Compatibility shim for existing routes ──────────────────────────────
//
// The old setRlsUserOnPool() doesn't work with pooled connections because
// SET only applies to one connection. We keep it as a no-op for backward
// compatibility — routes that use pool.query() directly should be migrated
// to withRls() or withDb(). In local dev (no DATABASE_URL_APP), it's
// truly a no-op since the superuser bypasses RLS.
//
// For production with RLS: routes using pool.query() directly after calling
// this will NOT have RLS enforced. They need to be migrated to withRls().
export async function setRlsUserOnPool(_userId: string): Promise<void> {
  // No-op. RLS only works per-transaction via SET LOCAL, not per-pool.
  // Routes must use withRls(userId) or withDb(fn, userId) for RLS.
}