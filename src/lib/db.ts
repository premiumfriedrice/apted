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

// Borrow a client from the shared pool, run fn, release on return/throw.
// Eliminates the repetitive pool.connect()/client.release() boilerplate
// across every API route (PRE-16).
export async function withDb<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
