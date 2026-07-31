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

// Create a Pool from DATABASE_URL. Used by scripts that need a standalone pool
// (migrate, seed, benchmark) rather than the shared singleton.
export function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new Pool({
    connectionString: strippedUrl(url),
    ssl: { rejectUnauthorized: false },
  });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL not set");
}

// Shared pool singleton for API routes. Use withDb() to borrow a client
// so connect/release is handled automatically.
export const pool = new Pool({
  connectionString: url ? strippedUrl(url) : "",
  ssl: url ? { rejectUnauthorized: false } : undefined,
});

// Borrow a client from the shared pool, set the RLS user ID, run fn, release on return/throw.
// The SET LOCAL ensures RLS policies see the correct user_id for this transaction.
// When auth is disabled (local mode), user_id defaults to 'local' which matches the
// backfilled rows from migration 0008.
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
// directly without borrowing a client). This sets it on the pool's default
// connection. Less secure than per-client SET LOCAL, but needed for routes
// that use pool.query() directly.
export async function setRlsUserOnPool(userId: string): Promise<void> {
  // SET only applies to the current session/connection in the pool.
  await pool.query("SET app.user_id = $1", [userId]);
}
