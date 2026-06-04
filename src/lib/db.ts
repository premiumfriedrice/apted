import pg from "pg";

const { Pool } = pg;

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

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL not set");
}

export const pool = new Pool({
  connectionString: url ? strippedUrl(url) : "",
  ssl: url ? { rejectUnauthorized: false } : undefined,
});
