// Assign existing single-user rows to a real Better Auth user.
//
// The migration 0008_auth.sql already backfills every pre-existing row with
// user_id='local' so the app keeps working in local mode. This script reassigns
// all of those rows to a specific Better Auth user — the first user by default,
// or a user chosen by email/uuid via flags. Run it AFTER the user has signed up
// and the 0008 migration has been applied.
//
// Usage:
//   npm run -s db:migrate                       # ensure 0008 is applied
//   tsx --env-file=.env.local scripts/migrate-to-multi-user.ts [--email you@x.com] [--user-id <uuid>]
//
// Safe to run repeatedly: only touches rows where user_id IS NOT the target.
// Idempotent across the seven tables.
import { createPool } from "../src/lib/db";

const pool = createPool();

const TABLES = [
  "master_resume",
  "master_pii_map",
  "user_settings",
  "api_keys",
  "drafts",
  "resume_versions",
  "applications",
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveUserId(): Promise<string> {
  const explicit = arg("--user-id");
  if (explicit) return explicit;
  const email = arg("--email");
  if (email) {
    const r = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [email]);
    if (!r.rows[0]) throw new Error(`No user found with email ${email}`);
    return r.rows[0].id;
  }
  // Default: the first (oldest) user.
  const r = await pool.query(`SELECT id, email, name FROM "user" ORDER BY "createdAt" ASC LIMIT 1`);
  if (!r.rows[0]) throw new Error("No Better Auth users exist yet — sign up first.");
  console.log(`Using first user: ${r.rows[0].email} (${r.rows[0].id})`);
  return r.rows[0].id;
}

async function main() {
  const targetUserId = await resolveUserId();
  console.log(`Reassigning existing rows to user ${targetUserId}…`);

  for (const table of TABLES) {
    // Avoid stealing rows that already belong to a real, different user (e.g.
    // a second user who signed up after migration). Only reassign rows still
    // sitting on the 'local' sentinel.
    const r = await pool.query(
      `UPDATE ${table} SET user_id = $1 WHERE user_id = 'local'`,
      [targetUserId],
    );
    console.log(`  ${table}: ${r.rowCount ?? 0} row(s) reassigned`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });