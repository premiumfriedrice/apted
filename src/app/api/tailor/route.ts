import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateResume } from "@/lib/llm";
import { getProviderForFlow } from "@/lib/providers";
import { getRanker } from "@/lib/relevance";
import { tailorUserPrompt } from "@/lib/prompts/user";

export const runtime = "nodejs";

// How many relevant prior versions to send as framing hints (PRE-11).
// Configurable via env; defaults to 5.
const RELEVANT_VERSIONS = Number(process.env.TAILOR_RELEVANT_VERSIONS) || 5;

export async function POST(req: Request) {
  const { jobDescription } = (await req.json()) as { jobDescription?: string };
  if (!jobDescription || !jobDescription.trim()) {
    return NextResponse.json({ error: "jobDescription required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const mr = await client.query("SELECT content FROM master_resume WHERE id = 1");
    if (!mr.rows[0]) {
      return NextResponse.json({ error: "master_resume not seeded" }, { status: 400 });
    }
    const master = Resume.parse(mr.rows[0].content);

    const vr = await client.query(
      "SELECT company, role, tailored_content FROM resume_versions ORDER BY created_at DESC LIMIT 20",
    );
    const priorVersions = vr.rows.map((r) => ({
      company: r.company,
      role: r.role,
      tailored_content: Resume.parse(r.tailored_content),
    }));

    // Rank prior versions by relevance to this JD (overlap or embeddings,
    // controlled by RELEVANCE_RANKER). Sending only the top K keeps the
    // prompt cheaper and stops off-domain resumes from skewing the framing.
    const ranker = getRanker();
    const relevantVersions = await ranker(jobDescription, priorVersions, RELEVANT_VERSIONS);

    const draft = await generateResume(
      tailorUserPrompt({ master, priorVersions: relevantVersions, jobDescription }),
      getProviderForFlow("tailor"),
    );

    const ins = await client.query(
      `INSERT INTO drafts (job_description, content, history)
       VALUES ($1, $2::jsonb, '[]'::jsonb)
       RETURNING id, content, history, created_at, updated_at`,
      [jobDescription, JSON.stringify(draft)],
    );
    const row = ins.rows[0];
    return NextResponse.json({
      id: row.id,
      jobDescription,
      content: row.content,
      history: row.history,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } finally {
    client.release();
  }
}
