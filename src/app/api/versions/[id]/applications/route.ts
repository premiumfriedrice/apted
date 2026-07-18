import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isOutcome, parseInterviewRound, parseRejectedAfterRound } from "@/lib/applications";
import { requireUserId } from "@/lib/auth";

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

export async function GET(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  // Ensure the version belongs to the user before listing its applications.
  const own = await pool.query(
    "SELECT 1 FROM resume_versions WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!own.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const r = await pool.query(
    "SELECT id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at FROM applications WHERE version_id = $1 AND user_id = $2 ORDER BY created_at DESC",
    [id, userId],
  );
  return NextResponse.json(r.rows.map(rowToJson));
}

export async function POST(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  // Ensure the version belongs to the user before adding an application.
  const own = await pool.query(
    "SELECT 1 FROM resume_versions WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!own.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const oc = outcome && isOutcome(outcome) ? outcome : "draft";
  const round = parseInterviewRound(interviewRound);
  const rejectedRound = parseRejectedAfterRound(rejectedAfterRound);
  const cleanPortalUrl =
    typeof portalUrl === "string" && portalUrl.trim() ? portalUrl.trim() : null;

  const r = await pool.query(
    `INSERT INTO applications (user_id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at`,
    [
      userId,
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