import { createPool } from "../src/lib/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Apply a single migration file by name. Used when re-running the full
// migrate.ts is unsafe because earlier migrations are not idempotent
// (e.g. 0001 references columns later dropped by 0004).
//
//   npx tsx --env-file=.env.local scripts/migrate-one.ts 0007_application_details.sql

const pool = createPool();
const dir = join(process.cwd(), "migrations");
const file = process.argv[2];

if (!file) {
  console.error("usage: migrate-one <filename.sql>");
  process.exit(1);
}

async function main() {
  const body = readFileSync(join(dir, file), "utf8");
  console.log(`-> ${file}`);
  await pool.query(body);
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });