import { NextResponse } from "next/server";
import { pool, setRlsUserOnPool} from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateInsights, getCachedInsights, saveInsights } from "@/lib/insights";
import type { Application } from "@/lib/applications";
import { requireUserId } from "@/lib/auth";

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

export async function GET(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setRlsUserOnPool(userId);
  const { id } = await params;
  const r = await pool.query(
    SELECT.replace("WHERE v.id = $1", "WHERE v.id = $1 AND v.user_id = $2"),
    [id, userId],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = r.rows[0];
  let resume: Resume;
  try {
    resume = Resume.parse(row.tailored_content);
  } catch {
    return NextResponse.json({ error: "resume content is invalid" }, { status: 500 });
  }

  const applications = row.applications as Application[];

  // Cache check (PRE-88): unless the caller asks for a refresh, return cached
  // insights immediately so repeat visits are instant and free. On a cache
  // miss (or refresh), generate via the LLM, persist, and return.
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "true";

  if (!refresh) {
    const cached = await getCachedInsights(id, userId);
    if (cached) return NextResponse.json(cached);
  }

  const insights = await generateInsights(resume, applications, userId);
  await saveInsights(id, userId, insights);

  return NextResponse.json(insights);
}
