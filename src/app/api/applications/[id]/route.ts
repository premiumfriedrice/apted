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
    "SELECT id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at FROM applications WHERE id = $1",
    [id],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToJson(r.rows[0]));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const fields: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (typeof body.company === "string") {
    fields.push(`company = $${i++}`);
    vals.push(body.company);
  }
  if (typeof body.role === "string") {
    fields.push(`role = $${i++}`);
    vals.push(body.role);
  }
  if (typeof body.portalUrl === "string") {
    fields.push(`portal_url = $${i++}`);
    vals.push(body.portalUrl.trim() ? body.portalUrl.trim() : null);
  }
  if (body.notes !== undefined && typeof body.notes === "string") {
    fields.push(`notes = $${i++}`);
    vals.push(body.notes);
  }
  if (typeof body.jobDescription === "string") {
    fields.push(`job_description = $${i++}`);
    vals.push(body.jobDescription);
  }
  if (typeof body.outcome === "string" && isOutcome(body.outcome)) {
    fields.push(`outcome = $${i++}`);
    vals.push(body.outcome);

    // Auto-set dependent fields so the DB check constraints stay satisfied
    // when the caller only changes the outcome.
    if (body.outcome === "interviewing" && body.interviewRound === undefined) {
      fields.push(`interview_round = $${i++}`);
      vals.push(1);
    }
    if (body.outcome === "rejected" && body.rejectedAfterRound === undefined) {
      if (body.interviewRound === undefined) {
        fields.push(`interview_round = $${i++}`);
        vals.push(null);
      }
      fields.push(`rejected_after_round = $${i++}`);
      vals.push(0);
    }
    // Terminal / pre-screening outcomes clear both round fields.
    if (["offer", "declined", "ghosted", "applied", "draft"].includes(body.outcome)) {
      if (body.interviewRound === undefined) {
        fields.push(`interview_round = $${i++}`);
        vals.push(null);
      }
      if (body.rejectedAfterRound === undefined) {
        fields.push(`rejected_after_round = $${i++}`);
        vals.push(null);
      }
    }
  }

  const interviewRound = parseInterviewRound(body.interviewRound);
  const rejectedAfterRound = parseRejectedAfterRound(body.rejectedAfterRound);

  if (body.interviewRound !== undefined) {
    fields.push(`interview_round = $${i++}`);
    vals.push(interviewRound);
  }
  if (body.rejectedAfterRound !== undefined) {
    fields.push(`rejected_after_round = $${i++}`);
    vals.push(rejectedAfterRound);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "no fields" }, { status: 400 });
  }

  vals.push(id);
  const r = await pool.query(
    `UPDATE applications SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, version_id, company, role, job_description, outcome, interview_round, rejected_after_round, portal_url, notes, created_at`,
    vals,
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToJson(r.rows[0]));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await pool.query("DELETE FROM applications WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
