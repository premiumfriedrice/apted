import pg from "pg";

const { Pool } = pg;

export type { PoolClient } from "pg";

// Strip ssl-related params from the URL so pg's URL parser doesn't override
// our explicit `ssl` config. Recent pg versions treat `sslmode=require` as
// verify-full, which breaks against Supabase's pooler cert chain.
function strippedUrl(u: string): string {
  try {
    const x = new URL(u);
    x.searchParams.delete("sslmode");
    x.searchParams.delete("ssl");
    return x.toString();
  } catch {
    return u;
  }
}

// Create a pg Pool from DATABASE_URL with the Supabase-safe SSL config.
// Exported for scripts that need their own pool (migrate, seed, benchmark)
// so they don't duplicate the strippedUrl + ssl logic.
export function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new Pool({
    connectionString: strippedUrl(url),
    ssl: { rejectUnauthorized: false },
  });
}

// withDb acquires a PoolClient, runs fn(client), and releases the client in a
// finally block. Use this for routes that need multiple queries against the
// same connection (e.g. read-then-write in tailor/edit) to avoid the
// boilerplate and the footgun of forgetting client.release().
//
// For single-query endpoints, just use pool.query() directly — it does
// acquire+release internally.
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

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL not set");
}

export const pool = new Pool({
  connectionString: url ? strippedUrl(url) : "",
  ssl: url ? { rejectUnauthorized: false } : undefined,
});
