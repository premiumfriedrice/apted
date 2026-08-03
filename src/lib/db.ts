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

// Create a Pool from DATABASE_URL (superuser). Used by scripts that need
// DDL access: migrate, seed, benchmark. This role bypasses RLS.
export function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new Pool({
    connectionString: strippedUrl(url),
    ssl: { rejectUnauthorized: false },
  });
}

// ── Runtime pool (app role, RLS-enforced) ─────────────────────────────────
//
// API routes use this pool. It connects as the apted_app role (non-superuser)
// so RLS policies are enforced. When DATABASE_URL_APP is set, we use it.
// When it's not set (local dev, migrations, tests), we fall back to
// DATABASE_URL (superuser) which bypasses RLS. This means:
//
//   - Local dev without DATABASE_URL_APP: RLS is bypassed (frictionless)
//   - Production with DATABASE_URL_APP set: RLS is enforced per-user
//
// The pool sets app.user_id per transaction via withDb(fn, userId).
// Routes that use pool.query() directly must call setRlsUserOnPool() first.

const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!appUrl) {
  console.warn("DATABASE_URL not set");
}

export const pool = new Pool({
  connectionString: appUrl ? strippedUrl(appUrl) : "",
  ssl: appUrl ? { rejectUnauthorized: false } : undefined,
});

// True when the pool is using the non-superuser apted_app role (RLS enforced).
export const rlsEnabled = !!process.env.DATABASE_URL_APP;

// Borrow a client from the shared pool, set the RLS user ID, run fn, release
// on return/throw. The SET LOCAL ensures RLS policies see the correct
// user_id for this transaction.
//
// When auth is disabled (local mode), user_id defaults to 'local' which
// matches the backfilled rows from migration 0008. When RLS is not enforced
// (no DATABASE_URL_APP), the SET LOCAL is harmless and ignored.
export async function withDb<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  userId?: string,
): Promise<T> {
  const client = await pool.connect();
  try {
    if (userId) {
      await client.query("SET LOCAL app.user_id = $1", [userId]);
    }
    return await fn(client);
  } finally {
    client.release();
  }
}

// Set the RLS user ID on a raw pool client (for routes that use pool.query
// directly instead of withDb). Call before any data queries.
export async function setRlsUser(client: pg.PoolClient, userId: string): Promise<void> {
  await client.query("SET LOCAL app.user_id = $1", [userId]);
}

// Set the RLS user ID for the current session (for routes that use pool.query
// directly without borrowing a client). Sets it on the connection.
export async function setRlsUserOnPool(userId: string): Promise<void> {
  await pool.query("SET app.user_id = $1", [userId]);
}