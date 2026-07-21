import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";
import { invalidateInsights } from "@/lib/insights";
import { injectResume } from "@/lib/redact";
import type { RedactionMap } from "@/lib/redact";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = `
  SELECT
    v.id,
    v.name,
    v.tailored_content,
    v.created_at,
    v.pdf,
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
          'portalUrl', a.portal_url,
          'notes', a.notes,
          'createdAt', a.created_at
        ) ORDER BY a.created_at DESC
      ) FILTER (WHERE a.id IS NOT NULL),
      '[]'::jsonb
    ) AS applications
  FROM resume_versions v
  LEFT JOIN applications a ON a.version_id = v.id
`;

function rowToJson(row: Record<string, unknown>) {
  const pdfBuf = row.pdf as Buffer | null;
  return {
    id: row.id,
    name: row.name,
    tailoredContent: row.tailored_content,
    createdAt: row.created_at,
    pdfBase64: pdfBuf ? pdfBuf.toString("base64") : null,
    applications: row.applications as Array<{
      id: string;
      versionId: string;
      company: string;
      role: string;
      jobDescription: string;
      outcome: string;
      interviewRound: number | null;
      rejectedAfterRound: number | null;
      portalUrl: string | null;
      notes: string | null;
      createdAt: string;
    }>,
  };
}

export async function GET(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await pool.query(
    `${SELECT} WHERE v.id = $1 AND v.user_id = $2 GROUP BY v.id`,
    [id, userId],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToJson(r.rows[0]));
}

export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const fields: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (body.tailoredContent !== undefined) {
    fields.push(`tailored_content = $${i++}::jsonb`);
    vals.push(JSON.stringify(Resume.parse(body.tailoredContent)));
  }
  if (typeof body.name === "string") {
    fields.push(`name = $${i++}`);
    vals.push(body.name.trim() || null);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "no fields" }, { status: 400 });
  }

  // If tailored_content changes, re-compile the PDF.
  if (body.tailoredContent !== undefined) {
    try {
      const parsed = Resume.parse(body.tailoredContent);
      const settings = await getUserSettings(userId);
      // Inject PII back before rendering (PRE-53).
      const pm = await pool.query("SELECT map FROM master_pii_map WHERE user_id = $1", [userId]);
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

  vals.push(id, userId);
  await pool.query(
    `UPDATE resume_versions SET ${fields.join(", ")} WHERE id = $${i} AND user_id = $${i + 1}`,
    vals,
  );

  // Invalidate cached insights when the resume content changes so they
  // regenerate on the next Insights tab view (PRE-88).
  if (body.tailoredContent !== undefined) {
    await invalidateInsights(id, userId);
  }

  const r = await pool.query(
    `${SELECT} WHERE v.id = $1 AND v.user_id = $2 GROUP BY v.id`,
    [id, userId],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToJson(r.rows[0]));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await pool.query("DELETE FROM resume_versions WHERE id = $1 AND user_id = $2", [id, userId]);
  return NextResponse.json({ ok: true });
}