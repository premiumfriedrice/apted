import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateResume } from "@/lib/llm";
import { editUserPrompt } from "@/lib/prompts/user";

export const runtime = "nodejs";

const MAX_UNDO = 20;

export async function POST(req: Request) {
  const { draftId, instruction } = (await req.json()) as {
    draftId?: string;
    instruction?: string;
  };
  if (!draftId || !instruction?.trim()) {
    return NextResponse.json({ error: "draftId and instruction required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    try {
    const dr = await client.query(
      "SELECT id, job_description, content, history FROM drafts WHERE id = $1",
      [draftId],
    );
    if (!dr.rows[0]) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    const current = Resume.parse(dr.rows[0].content);

    const mr = await client.query("SELECT content FROM master_resume WHERE id = 1");
    if (!mr.rows[0]) return NextResponse.json({ error: "master_resume missing" }, { status: 400 });
    const master = Resume.parse(mr.rows[0].content);

    // The draft IS the accumulated state — we do NOT replay chat history.
    const next = await generateResume(
      editUserPrompt({ master, current, instruction }),
    );

    const prevHistory: unknown[] = Array.isArray(dr.rows[0].history) ? dr.rows[0].history : [];
    const history = [...prevHistory, current].slice(-MAX_UNDO);

    const upd = await client.query(
      `UPDATE drafts
         SET content = $1::jsonb,
             history = $2::jsonb,
             updated_at = now()
       WHERE id = $3
       RETURNING id, job_description, content, history, created_at, updated_at`,
      [JSON.stringify(next), JSON.stringify(history), draftId],
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
    } catch (e: unknown) {
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: "schema mismatch", details: e.flatten() },
          { status: 400 },
        );
      }
      const msg = e instanceof Error ? e.message : "edit failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } finally {
    client.release();
  }
}
