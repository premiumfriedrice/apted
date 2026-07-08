// Regenerate names for resume versions that still have the default
// "Version from YYYY-MM-DD" placeholder. Uses the latest application's
// job description plus the resume content to generate a focused name.
//
// Run with: tsx --env-file=.env.local scripts/regenerate-version-names.ts

import { createPool } from "../src/lib/db";
import { Resume } from "../src/lib/resume";
import { generateVersionName } from "../src/lib/version-names";

const pool = createPool();

async function main() {
  const { rows } = await pool.query(
    `SELECT v.id, v.tailored_content, a.job_description, a.role
     FROM resume_versions v
     LEFT JOIN LATERAL (
       SELECT job_description, role FROM applications
       WHERE version_id = v.id
       ORDER BY created_at DESC
       LIMIT 1
     ) a ON true
     ORDER BY v.created_at ASC`
  );

  console.log(`Found ${rows.length} versions with placeholder names.`);

  if (rows.length === 0) {
    console.log("Nothing to regenerate.");
    await pool.end();
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const id = row.id;
    try {
      const resume = Resume.parse(row.tailored_content);
      const name = await generateVersionName(resume, row.job_description, row.role);
      await pool.query("UPDATE resume_versions SET name = $1 WHERE id = $2", [name, id]);
      ok++;
      console.log(`  ✓ ${id.slice(0, 8)}... → "${name}"`);
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${id.slice(0, 8)}... failed: ${msg}`);
    }
  }

  console.log(`\nDone: ${ok} ok, ${fail} failed out of ${rows.length}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
