import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await pool.query(
    "SELECT id, job_description, content, history, created_at, updated_at FROM drafts WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = r.rows[0];
  return NextResponse.json({
    id: row.id,
    jobDescription: row.job_description,
    content: row.content,
    history: row.history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// PATCH supports two operations:
//   { op: "undo" }                      -> pop the history stack into content
//   { op: "replace", content: Resume }  -> replace content and push old into history
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as
    | { op: "undo" }
    | { op: "replace"; content: unknown };

  const dr = await pool.query(
    "SELECT content, history FROM drafts WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!dr.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const current = Resume.parse(dr.rows[0].content);
  const history: unknown[] = Array.isArray(dr.rows[0].history) ? dr.rows[0].history : [];

  if (body.op === "undo") {
    if (history.length === 0) return NextResponse.json({ error: "nothing to undo" }, { status: 400 });
    const prev = Resume.parse(history[history.length - 1]);
    const newHistory = history.slice(0, -1);
    const upd = await pool.query(
      `UPDATE drafts SET content = $1::jsonb, history = $2::jsonb, updated_at = now()
       WHERE id = $3 AND user_id = $4 RETURNING id, job_description, content, history, created_at, updated_at`,
      [JSON.stringify(prev), JSON.stringify(newHistory), id, userId],
    );
    const row = upd.rows[0];
    return NextResponse.json({
      id: row.id,
      jobDescription: row.job_description,
      content: row.content,
      history: row.history,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  if (body.op === "replace") {
    const next = Resume.parse(body.content);
    const newHistory = [...history, current].slice(-20);
    const upd = await pool.query(
      `UPDATE drafts SET content = $1::jsonb, history = $2::jsonb, updated_at = now()
       WHERE id = $3 AND user_id = $4 RETURNING id, job_description, content, history, created_at, updated_at`,
      [JSON.stringify(next), JSON.stringify(newHistory), id, userId],
    );
    const row = upd.rows[0];
    return NextResponse.json({
      id: row.id,
      jobDescription: row.job_description,
      content: row.content,
      history: row.history,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}