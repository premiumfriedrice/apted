import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await pool.query(
    "SELECT tailored_content FROM resume_versions WHERE id = $1",
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
