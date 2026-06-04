import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";

export const runtime = "nodejs";

const OUTCOMES = ["draft", "applied", "interview", "offer", "rejected"] as const;
type Outcome = (typeof OUTCOMES)[number];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const outcome = url.searchParams.get("outcome");
  if (outcome && !OUTCOMES.includes(outcome as Outcome)) {
    return NextResponse.json({ error: "invalid outcome" }, { status: 400 });
  }
  const r = outcome
    ? await pool.query(
        "SELECT id, company, role, job_description, tailored_content, outcome, created_at FROM resume_versions WHERE outcome = $1 ORDER BY created_at DESC",
        [outcome],
      )
    : await pool.query(
        "SELECT id, company, role, job_description, tailored_content, outcome, created_at FROM resume_versions ORDER BY created_at DESC",
      );
  return NextResponse.json(r.rows.map((row) => ({
    id: row.id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    tailoredContent: row.tailored_content,
    outcome: row.outcome,
    createdAt: row.created_at,
  })));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { company, role, jobDescription, tailoredContent, outcome } = body as {
    company?: string;
    role?: string;
    jobDescription?: string;
    tailoredContent?: unknown;
    outcome?: Outcome;
  };
  if (!company || !role || !jobDescription || !tailoredContent) {
    return NextResponse.json({ error: "company, role, jobDescription, tailoredContent required" }, { status: 400 });
  }
  const content = Resume.parse(tailoredContent);
  const oc: Outcome = outcome && OUTCOMES.includes(outcome) ? outcome : "draft";
  const r = await pool.query(
    `INSERT INTO resume_versions (company, role, job_description, tailored_content, outcome)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, company, role, job_description, tailored_content, outcome, created_at`,
    [company, role, jobDescription, JSON.stringify(content), oc],
  );
  const row = r.rows[0];
  return NextResponse.json({
    id: row.id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    tailoredContent: row.tailored_content,
    outcome: row.outcome,
    createdAt: row.created_at,
  });
}
