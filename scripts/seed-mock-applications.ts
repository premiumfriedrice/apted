// Seed a local store with mock applications so the /applications Sankey
// funnel can be previewed without real data. Every ribbon of the funnel is
// exercised: drafts, screening pass, screening rejections, ghosted,
// technical, technical rejections, final, final rejections, offers, declined.
//
// Usage (local Postgres on :5433 — see docs/handoff or run `npm run dev:local`):
//   DATABASE_URL=postgres://localhost:5433/apted npx tsx scripts/seed-mock-applications.ts
//
// Idempotent: clears existing version-linked applications + versions for the
// local user before inserting, so re-running gives a stable dataset.
import { createPool } from "../src/lib/db";
import { emptyMaster } from "../src/lib/resume";

// Sentinel user id used when auth is disabled (mirrors src/lib/auth.ts —
// imported literally here to avoid dragging the Better Auth runtime in).
const LOCAL_USER_ID = "local";

type MockApp = {
  company: string;
  role: string;
  outcome: "draft" | "applied" | "ghosted" | "interviewing" | "rejected" | "offer" | "declined";
  interviewRound?: number;
  rejectedAfterRound?: number;
  daysAgo: number;
};

// Distribution (24 apps) → funnel: total 24, drafts 4, screening 20,
// screeningRej 4, ghosted 8 (applied+ghosted), technical 8, techRej 2,
// final 4, finalRej 1, offers 1, declined 1.
const MOCK: MockApp[] = [
  // 4 drafts (never submitted → "drafts" drop-off ribbon)
  { company: "Figma", role: "Product Engineer", outcome: "draft", daysAgo: 2 },
  { company: "Notion", role: "Full-Stack Engineer", outcome: "draft", daysAgo: 5 },
  { company: "Ramp", role: "Frontend Engineer", outcome: "draft", daysAgo: 8 },
  { company: "Mercury", role: "Software Engineer", outcome: "draft", daysAgo: 11 },
  // 5 applied (in screening, no response yet — lumped into "ghosted" ribbon
  // by the funnel calc: screening − rejections − technical)
  { company: "Linear", role: "Senior Engineer", outcome: "applied", daysAgo: 3 },
  { company: "Vercel", role: "Product Engineer", outcome: "applied", daysAgo: 6 },
  { company: "Retool", role: "Full-Stack Engineer", outcome: "applied", daysAgo: 9 },
  { company: "Airbnb", role: "Software Engineer II", outcome: "applied", daysAgo: 14 },
  { company: "Duolingo", role: "Backend Engineer", outcome: "applied", daysAgo: 18 },
  // 3 ghosted
  { company: "Datadog", role: "Senior Backend Engineer", outcome: "ghosted", daysAgo: 22 },
  { company: "Cloudflare", role: "Systems Engineer", outcome: "ghosted", daysAgo: 26 },
  { company: "Plaid", role: "Software Engineer", outcome: "ghosted", daysAgo: 30 },
  // 4 rejected at screening (rejectedAfterRound = 0)
  { company: "Stripe", role: "Senior Engineer", outcome: "rejected", rejectedAfterRound: 0, daysAgo: 7 },
  { company: "Coinbase", role: "Backend Engineer", outcome: "rejected", rejectedAfterRound: 0, daysAgo: 12 },
  { company: "Flexport", role: "Full-Stack Engineer", outcome: "rejected", rejectedAfterRound: 0, daysAgo: 16 },
  { company: "Gusto", role: "Product Engineer", outcome: "rejected", rejectedAfterRound: 0, daysAgo: 20 },
  // 2 rejected after technical (rejectedAfterRound = 1)
  { company: "Anthropic", role: "Software Engineer", outcome: "rejected", rejectedAfterRound: 1, daysAgo: 21 },
  { company: "Scale AI", role: "Frontend Engineer", outcome: "rejected", rejectedAfterRound: 1, daysAgo: 28 },
  // 1 rejected after final (rejectedAfterRound = 2)
  { company: "Roblox", role: "Senior Product Engineer", outcome: "rejected", rejectedAfterRound: 2, daysAgo: 35 },
  // 2 interviewing at round 1 (technical only)
  { company: "Databricks", role: "Senior Software Engineer", outcome: "interviewing", interviewRound: 1, daysAgo: 4 },
  { company: "Confluent", role: "Backend Engineer", outcome: "interviewing", interviewRound: 1, daysAgo: 10 },
  // 1 interviewing at round 2 (final stage)
  { company: "Netflix", role: "Senior UI Engineer", outcome: "interviewing", interviewRound: 2, daysAgo: 13 },
  // 1 offer 🎉
  { company: "Figma", role: "Design Engineer", outcome: "offer", interviewRound: 3, daysAgo: 24 },
  // 1 declined after final
  { company: "Tesla", role: "Staff Engineer", outcome: "declined", interviewRound: 3, daysAgo: 32 },
];

const JD_STUB =
  "You will build delightful software. Requirements: 5+ years experience, " +
  "strong systems fundamentals, and a passion for craft. We offer competitive " +
  "compensation and a collaborative remote-first culture.";

const pool = createPool();

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Reset version-linked data for the local user (standalone applications
    // with version_id NULL are left alone).
    await client.query(
      `DELETE FROM resume_versions WHERE user_id = $1`,
      [LOCAL_USER_ID],
    );

    const content = JSON.stringify(emptyMaster());
    let n = 0;
    for (const m of MOCK) {
      const createdAt = new Date(Date.now() - m.daysAgo * 24 * 60 * 60 * 1000);
      const v = await client.query(
        `INSERT INTO resume_versions (tailored_content, name, user_id, created_at)
         VALUES ($1::jsonb, $2, $3, $4)
         RETURNING id`,
        [content, `${m.company} — ${m.role}`, LOCAL_USER_ID, createdAt],
      );
      const versionId = v.rows[0].id as string;
      await client.query(
        `INSERT INTO applications
           (version_id, user_id, company, role, job_description, outcome,
            interview_round, rejected_after_round, portal_url, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          versionId,
          LOCAL_USER_ID,
          m.company,
          m.role,
          JD_STUB,
          m.outcome,
          m.interviewRound ?? null,
          m.rejectedAfterRound ?? null,
          `https://jobs.example.com/${m.company.toLowerCase().replace(/\W+/g, "-")}`,
          null,
          createdAt,
        ],
      );
      n++;
    }
    await client.query("COMMIT");
    console.log(`seeded ${n} mock applications (${LOCAL_USER_ID} user)`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
