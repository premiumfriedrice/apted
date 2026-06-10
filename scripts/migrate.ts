import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createPool } from "../src/lib/db";

const dir = join(process.cwd(), "migrations");

async function main() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pool = createPool();
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
