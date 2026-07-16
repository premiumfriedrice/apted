import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isOutcome, parseInterviewRound, parseRejectedAfterRound } from "@/lib/applications";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function rowToJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    versionId: row.version_id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    outcome: row.outcome,
    interviewRound: row.interview_round,
    rejectedAfterRound: row.rejected_after_round,
    portalUrl: row.portal_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await pool.query(
    "SELECT id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at FROM applications WHERE version_id = $1 ORDER BY created_at DESC",
    [id],
  );
  return NextResponse.json(r.rows.map(rowToJson));
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const { company, role, jobDescription, outcome, portalUrl, interviewRound, rejectedAfterRound } = body as {
    company?: string;
    role?: string;
    jobDescription?: string;
    outcome?: string;
    portalUrl?: string;
    interviewRound?: unknown;
    rejectedAfterRound?: unknown;
  };

  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role required" },
      { status: 400 },
    );
  }

  const oc = outcome && isOutcome(outcome) ? outcome : "draft";
  const round = parseInterviewRound(interviewRound);
  const rejectedRound = parseRejectedAfterRound(rejectedAfterRound);
  const cleanPortalUrl =
    typeof portalUrl === "string" && portalUrl.trim() ? portalUrl.trim() : null;

  const r = await pool.query(
    `INSERT INTO applications (version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at`,
    [
      id,
      company,
      role,
      jobDescription ?? "",
      oc,
      oc === "interviewing" ? round : null,
      oc === "rejected" ? rejectedRound : null,
      cleanPortalUrl,
    ],
  );
  return NextResponse.json(rowToJson(r.rows[0]));
}
