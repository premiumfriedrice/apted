import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateInsights } from "@/lib/insights";
import type { Application } from "@/lib/applications";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

const SELECT = `
  SELECT
    v.tailored_content,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'versionId', a.version_id,
          'company', a.company,
          'role', a.role,
          'jobDescription', a.job_description,
          'outcome', a.outcome,
          'interviewRound', a.interview_round,
          'rejectedAfterRound', a.rejected_after_round,
          'createdAt', a.created_at
        ) ORDER BY a.created_at DESC
      ) FILTER (WHERE a.id IS NOT NULL),
      '[]'::jsonb
    ) AS applications
  FROM resume_versions v
  LEFT JOIN applications a ON a.version_id = v.id
  WHERE v.id = $1
  GROUP BY v.id
`;

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await pool.query(SELECT, [id]);
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = r.rows[0];
  let resume: Resume;
  try {
    resume = Resume.parse(row.tailored_content);
  } catch {
    return NextResponse.json({ error: "resume content is invalid" }, { status: 500 });
  }

  const applications = row.applications as Application[];
  const insights = await generateInsights(resume, applications);

  return NextResponse.json(insights);
}
