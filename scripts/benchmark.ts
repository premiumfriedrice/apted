// Multi-model benchmark for the tailoring path (APTED-010).
//
// Runs the SAME tailoring input through every configured provider and reports
// latency + whether the output is schema-valid, so the cost-down model choice
// is made on evidence. Providers without an API key are skipped, not failed.
//
//   npm run benchmark -- path/to/job-description.txt
//   npm run benchmark            # uses a built-in sample JD
//
// Cost is NOT measured yet — the provider interface doesn't surface token usage
// (APTED-010 follow-up); estimate from published per-token prices for now.
import fs from "node:fs";
import { createPool } from "../src/lib/db";
import { Resume } from "../src/lib/resume";
import { generateResume } from "../src/lib/llm";
import { tailorUserPrompt } from "../src/lib/prompts/user";
import { rankPriorVersions } from "../src/lib/relevance";
import { getProvider, PROVIDER_NAMES, type ProviderName } from "../src/lib/providers";

const pool = createPool();

const KEY_ENV: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const SAMPLE_JD = `Senior Mobile Engineer (iOS). Build and ship native iOS
features in Swift/SwiftUI, own the app architecture, work with REST/GraphQL
APIs, and collaborate with design on polished UX. Experience with offline
sync, push notifications, and App Store release process required.`;

async function main() {
  const jdPath = process.argv[2];
  const jobDescription = jdPath ? fs.readFileSync(jdPath, "utf-8") : SAMPLE_JD;

  const mr = await pool.query("SELECT content FROM master_resume WHERE id = 1");
  if (!mr.rows[0]) {
    console.error("master_resume not seeded — run `npm run db:seed` first.");
    process.exit(1);
  }
  const master = Resume.parse(mr.rows[0].content);

  const vr = await pool.query(
    "SELECT company, role, tailored_content FROM resume_versions ORDER BY created_at DESC LIMIT 20",
  );
  const priorVersions = vr.rows.map((r) => ({
    company: r.company,
    role: r.role,
    tailored_content: Resume.parse(r.tailored_content),
  }));
  const relevant = await rankPriorVersions(jobDescription, priorVersions, 5);
  const prompt = tailorUserPrompt({ master, priorVersions: relevant, jobDescription });

  console.log(
    `\nBenchmarking ${PROVIDER_NAMES.length} providers on a ${jobDescription.length}-char JD ` +
      `with ${relevant.length}/${priorVersions.length} prior versions.\n`,
  );

  const results: Array<{
    provider: string;
    model: string;
    status: string;
    ms: number;
    sections: number | "-";
  }> = [];

  for (const name of PROVIDER_NAMES) {
    if (!process.env[KEY_ENV[name]]) {
      results.push({ provider: name, model: `(no ${KEY_ENV[name]})`, status: "skipped", ms: 0, sections: "-" });
      continue;
    }
    const provider = getProvider(name);
    const start = Date.now();
    try {
      const draft = await generateResume(prompt, provider);
      results.push({
        provider: name,
        model: provider.model,
        status: "ok",
        ms: Date.now() - start,
        sections: draft.sections.length,
      });
    } catch (e) {
      results.push({
        provider: name,
        model: provider.model,
        status: `FAIL: ${(e as Error).message.slice(0, 60)}`,
        ms: Date.now() - start,
        sections: "-",
      });
    }
  }

  console.table(results);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
