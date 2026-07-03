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
    "SELECT id, version_id, company, role, job_description, outcome, created_at FROM applications WHERE version_id = $1 ORDER BY created_at DESC",
    [id],
  );
  return NextResponse.json(r.rows.map(rowToJson));
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const { company, role, jobDescription, outcome } = body as {
    company?: string;
    role?: string;
    jobDescription?: string;
    outcome?: string;
  };

  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role required" },
      { status: 400 },
    );
  }

  const oc = outcome && isOutcome(outcome) ? outcome : "draft";

  const r = await pool.query(
    `INSERT INTO applications (version_id, company, role, job_description, outcome)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, version_id, company, role, job_description, outcome, created_at`,
    [id, company, role, jobDescription ?? "", oc],
  );
  return NextResponse.json(rowToJson(r.rows[0]));
}
