// Backfill script: compile and store PDFs for all resume_versions rows where pdf is NULL.
// Run with: npm run backfill-pdfs
//   (or: tsx --env-file=.env.local scripts/backfill-pdfs.ts)

import { createPool } from "../src/lib/db";
import { Resume } from "../src/lib/resume";
import { renderResume } from "../src/lib/render";
import { getUserSettings } from "../src/lib/settings";
import { compileTexToPdf } from "../src/lib/compile";
import { LOCAL_USER_ID } from "../src/lib/auth";

const pool = createPool();

async function main() {
  const { rows } = await pool.query(
    "SELECT id, tailored_content FROM resume_versions WHERE pdf IS NULL ORDER BY created_at ASC"
  );
  console.log(`Found ${rows.length} versions without PDF.`);

  if (rows.length === 0) {
    console.log("Nothing to backfill.");
    await pool.end();
    return;
  }

  const settings = await getUserSettings(LOCAL_USER_ID);
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const id = row.id;
    try {
      const resume = Resume.parse(row.tailored_content);
      const tex = renderResume(resume, settings.template);
      const pdf = await compileTexToPdf(tex);
      await pool.query("UPDATE resume_versions SET pdf = $1 WHERE id = $2", [pdf, id]);
      ok++;
      console.log(`  ✓ ${id.slice(0, 8)}... compiled (${pdf.length} bytes)`);
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