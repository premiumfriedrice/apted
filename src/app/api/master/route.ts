import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { redactResume } from "@/lib/redact";
import type { RedactionMap } from "@/lib/redact";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [mr, pm] = await Promise.all([
    pool.query("SELECT content, updated_at FROM master_resume WHERE user_id = $1", [userId]),
    pool.query("SELECT map FROM master_pii_map WHERE user_id = $1", [userId]),
  ]);
  if (!mr.rows[0]) return NextResponse.json({ error: "not seeded" }, { status: 404 });
  return NextResponse.json({
    content: mr.rows[0].content,
    updatedAt: mr.rows[0].updated_at,
    piiMap: pm.rows[0]?.map ?? null,
  });
}

export async function PUT(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const content = Resume.parse(body.content);

  // Redact PII before storing — raw PII never hits DB (PRE-51).
  const { redacted, map: piiMap } = redactResume(content);

  const [r] = await Promise.all([
    pool.query(
      `INSERT INTO master_resume (user_id, content, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
       RETURNING content, updated_at`,
      [userId, JSON.stringify(redacted)],
    ),
    pool.query(
      `INSERT INTO master_pii_map (user_id, map, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET map = EXCLUDED.map, updated_at = now()`,
      [userId, JSON.stringify(piiMap)],
    ),
  ]);

  return NextResponse.json({
    content: r.rows[0].content,
    updatedAt: r.rows[0].updated_at,
    piiMap,
  });
}