import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";
import { injectResume } from "@/lib/redact";
import type { RedactionMap } from "@/lib/redact";

export const runtime = "nodejs";

const OUTCOMES = ["draft", "applied", "interview", "offer", "rejected"] as const;
type Outcome = (typeof OUTCOMES)[number];

type Ctx = { params: Promise<{ id: string }> };

function rowToJson(row: Record<string, unknown>) {
  const pdfBuf = row.pdf as Buffer | null;
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jobDescription: row.job_description,
    tailoredContent: row.tailored_content,
    outcome: row.outcome,
    createdAt: row.created_at,
    pdfBase64: pdfBuf ? pdfBuf.toString("base64") : null,
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
      // Inject PII back before rendering (PRE-53).
      const pm = await pool.query("SELECT map FROM master_pii_map WHERE id = 1");
      const piiMap = pm.rows[0]?.map as RedactionMap | null;
      let renderContent = parsed;
      if (piiMap) renderContent = injectResume(parsed, piiMap);
      const tex = renderResume(renderContent, settings.template);
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

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await pool.query(
    "SELECT company, role, job_description, tailored_content FROM resume_versions WHERE id = $1",
    [id],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = r.rows[0];
  const ins = await pool.query(
    `INSERT INTO drafts (job_description, content, history)
     VALUES ($1, $2::jsonb, '[]'::jsonb)
     RETURNING id, job_description, content, history, created_at, updated_at`,
    [row.job_description, JSON.stringify(Resume.parse(row.tailored_content))],
  );
  const draft = ins.rows[0];
  return NextResponse.json({
    id: draft.id,
    jobDescription: draft.job_description,
    content: draft.content,
    history: draft.history,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await pool.query("DELETE FROM resume_versions WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}