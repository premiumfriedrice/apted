import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";

export const runtime = "nodejs";

export async function GET() {
  const r = await pool.query("SELECT content, updated_at FROM master_resume WHERE id = 1");
  if (!r.rows[0]) return NextResponse.json({ error: "not seeded" }, { status: 404 });
  return NextResponse.json({ content: r.rows[0].content, updatedAt: r.rows[0].updated_at });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const content = Resume.parse(body.content);
  const r = await pool.query(
    `INSERT INTO master_resume (id, content, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
     RETURNING content, updated_at`,
    [JSON.stringify(content)],
  );
  return NextResponse.json({ content: r.rows[0].content, updatedAt: r.rows[0].updated_at });
}
