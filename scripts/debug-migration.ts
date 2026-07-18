import { createPool } from "../src/lib/db";

const pool = createPool();

async function main() {
  // Check users
  const users = await pool.query('SELECT id, email, name FROM "user" ORDER BY "createdAt" ASC LIMIT 5');
  console.log("Users:", JSON.stringify(users.rows, null, 2));

  // Check if rows still have user_id = 'local'
  const tables = ["master_resume", "master_pii_map", "user_settings", "api_keys", "drafts", "resume_versions", "applications"];
  for (const table of tables) {
    try {
      const r = await pool.query(`SELECT user_id, count(*) FROM ${table} GROUP BY user_id`);
      console.log(`${table}:`, JSON.stringify(r.rows));
    } catch (e) {
      console.log(`${table}: ERROR - ${(e as Error).message}`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
