import pg from "pg";
import { emptyMaster } from "../src/lib/resume";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

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

const pool = new Pool({
  connectionString: strippedUrl(url),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const content = emptyMaster();
  await pool.query(
    `INSERT INTO master_resume (id, content)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(content)],
  );
  const r = await pool.query("SELECT id, updated_at FROM master_resume WHERE id = 1");
  console.log("master_resume:", r.rows[0]);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
