import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await pool.query(
    `SELECT v.tailored_content, a.job_description
     FROM resume_versions v
     LEFT JOIN LATERAL (
       SELECT job_description FROM applications WHERE version_id = v.id ORDER BY created_at DESC LIMIT 1
     ) a ON true
     WHERE v.id = $1 AND v.user_id = $2`,
    [id, userId],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = r.rows[0];
  const ins = await pool.query(
    `INSERT INTO drafts (user_id, job_description, content, history)
     VALUES ($1, $2, $3::jsonb, '[]'::jsonb)
     RETURNING id, job_description, content, history, created_at, updated_at`,
    [userId, row.job_description ?? "", JSON.stringify(Resume.parse(row.tailored_content))],
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