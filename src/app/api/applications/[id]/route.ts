import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isOutcome } from "@/lib/applications";

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
    createdAt: row.created_at,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await pool.query(
    "SELECT id, version_id, company, role, job_description, outcome, created_at FROM applications WHERE id = $1",
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
  if (typeof body.jobDescription === "string") {
    fields.push(`job_description = $${i++}`);
    vals.push(body.jobDescription);
  }
  if (typeof body.outcome === "string" && isOutcome(body.outcome)) {
    fields.push(`outcome = $${i++}`);
    vals.push(body.outcome);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "no fields" }, { status: 400 });
  }

  vals.push(id);
  const r = await pool.query(
    `UPDATE applications SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, version_id, company, role, job_description, outcome, created_at`,
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
