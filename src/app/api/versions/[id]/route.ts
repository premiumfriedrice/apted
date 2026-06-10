import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";

export const runtime = "nodejs";

const OUTCOMES = ["draft", "applied", "interview", "offer", "rejected"] as const;
type Outcome = (typeof OUTCOMES)[number];

type Ctx = { params: Promise<{ id: string }> };

function rowToJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    tailoredContent: row.tailored_content,
    outcome: row.outcome,
    createdAt: row.created_at,
    pdf: (row.pdf as Buffer | null)?.toString("base64") ?? null,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await pool.query(
    "SELECT id, company, role, job_description, tailored_content, outcome, created_at, pdf FROM resume_versions WHERE id = $1",
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
  if (typeof body.company === "string")          { fields.push(`company = $${i++}`);          vals.push(body.company); }
  if (typeof body.role === "string")             { fields.push(`role = $${i++}`);             vals.push(body.role); }
  if (typeof body.jobDescription === "string")   { fields.push(`job_description = $${i++}`);  vals.push(body.jobDescription); }
  if (body.tailoredContent !== undefined)        { fields.push(`tailored_content = $${i++}::jsonb`); vals.push(JSON.stringify(Resume.parse(body.tailoredContent))); }
  if (typeof body.outcome === "string" && OUTCOMES.includes(body.outcome)) {
    fields.push(`outcome = $${i++}`); vals.push(body.outcome);
  }
  if (fields.length === 0) return NextResponse.json({ error: "no fields" }, { status: 400 });

  // If tailored_content changes, re-compile the PDF.
  if (body.tailoredContent !== undefined) {
    try {
      const parsed = Resume.parse(body.tailoredContent);
      const settings = await getUserSettings();
      const tex = renderResume(parsed, settings.template);
      const pdfBuf = await compileTexToPdf(tex);
      fields.push(`pdf = $${i++}`);
      vals.push(pdfBuf);
    } catch {
      console.warn("PDF re-compile failed on PATCH for version", id);
    }
  }

  vals.push(id);
  const r = await pool.query(
    `UPDATE resume_versions SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, company, role, job_description, tailored_content, outcome, created_at, pdf`,
    vals,
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToJson(r.rows[0]));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await pool.query("DELETE FROM resume_versions WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
