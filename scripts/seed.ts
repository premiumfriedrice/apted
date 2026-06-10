import { createPool } from "../src/lib/db";
import { emptyMaster } from "../src/lib/resume";

async function main() {
  const pool = createPool();
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
