// Apply a single migration file against the DATABASE_URL env var.
//
// The full `npm run db:migrate` script re-runs EVERY migration file, and
// several of the older ones (e.g. 0004) drop columns without IF EXISTS — so
// it can only be pointed at a fresh database. For an *existing* prod database
// that already has 0001–0007 applied, use this instead to apply just one new
// file (typically 0008_auth.sql) safely.
//
// Loads .env.local by default so local `npm run db:migrate-one` works. Point
// it at prod by prefixing with the prod DATABASE_URL:
//
//   DATABASE_URL=<prod-url> npx tsx --env-file=.env.local scripts/migrate-one.ts migrations/0008_auth.sql
//   # or, if .env.local already holds the prod URL:
//   npm run db:migrate-one -- migrations/0008_auth.sql
//
import { createPool } from "../src/lib/db";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/migrate-one.ts <migrations/0008_auth.sql | 0008_auth.sql>");
  process.exit(1);
}

const dir = join(process.cwd(), "migrations");
const path = file.endsWith(".sql") && file.includes("/") ? resolve(file) : join(dir, file);

const pool = createPool();
const body = readFileSync(path, "utf8");

async function main() {
  const client = await pool.connect();
  try {
    await client.query(body);
    console.log(`applied ${path}`);
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });