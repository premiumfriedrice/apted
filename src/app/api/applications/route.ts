import { NextResponse } from "next/server";
import { pool, setRlsUserOnPool} from "@/lib/db";
import { isOutcome, parseInterviewRound, parseRejectedAfterRound } from "@/lib/applications";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

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

// Create a standalone application (no linked resume version).
// Used when the user wants to track an application they submitted
// outside of apted — no tailored resume required.
export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setRlsUserOnPool(userId);

  const body = await req.json();
  const {
    company,
    role,
    jobDescription,
    outcome,
    portalUrl,
    interviewRound,
    rejectedAfterRound,
    notes,
  } = body as {
    company?: string;
    role?: string;
    jobDescription?: string;
    outcome?: string;
    portalUrl?: string;
    interviewRound?: unknown;
    rejectedAfterRound?: unknown;
    notes?: string;
  };

  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 },
    );
  }

  const oc = outcome && isOutcome(outcome) ? outcome : "draft";
  const round = parseInterviewRound(interviewRound);
  const rejectedRound = parseRejectedAfterRound(rejectedAfterRound);
  const cleanPortalUrl =
    typeof portalUrl === "string" && portalUrl.trim() ? portalUrl.trim() : null;
  const cleanNotes = typeof notes === "string" ? notes.trim() : null;

  const r = await pool.query(
    `INSERT INTO applications (user_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at`,
    [
      userId,
      company,
      role,
      jobDescription ?? "",
      oc,
      oc === "interviewing" ? round : null,
      oc === "rejected" ? rejectedRound : null,
      cleanPortalUrl,
      cleanNotes,
    ],
  );
  return NextResponse.json(rowToJson(r.rows[0]));
}

// List all applications for the user (standalone + version-linked).
export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setRlsUserOnPool(userId);

  const url = new URL(req.url);
  const outcome = url.searchParams.get("outcome");

  const r = outcome
    ? await pool.query(
        `SELECT id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at
         FROM applications WHERE user_id = $1 AND outcome = $2 ORDER BY created_at DESC`,
        [userId, outcome],
      )
    : await pool.query(
        `SELECT id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at
         FROM applications WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      );
  return NextResponse.json(r.rows.map(rowToJson));
}
