import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
const dir = join(process.cwd(), "migrations");

async function main() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    for (const file of files) {
      const body = readFileSync(join(dir, file), "utf8");
      console.log(`-> ${file}`);
      await client.query(body);
    }
    console.log("migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
