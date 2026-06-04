// Convenience endpoint: takes a free-form "fact" the user wants stored on the
// master, plus a section hint (e.g. "experience"), and appends a bullet to
// the most recent item of that section. This is a deliberately minimal hook
// for the UI's "Save this to your master resume?" prompt; richer merges can
// happen in /master.
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sectionId, itemId, bulletText } = (await req.json()) as {
    sectionId?: string;
    itemId?: string;
    bulletText?: string;
  };
  if (!sectionId || !itemId || !bulletText?.trim()) {
    return NextResponse.json({ error: "sectionId, itemId, bulletText required" }, { status: 400 });
  }

  const r = await pool.query("SELECT content FROM master_resume WHERE id = 1");
  if (!r.rows[0]) return NextResponse.json({ error: "master missing" }, { status: 400 });
  const master = Resume.parse(r.rows[0].content);

  const sec = master.sections.find((s) => s.id === sectionId);
  if (!sec) return NextResponse.json({ error: "section not found" }, { status: 404 });
  if (sec.kind === "skills") return NextResponse.json({ error: "skills section uses groups, not bullets" }, { status: 400 });

  const item = (sec.items as Array<{ id: string; bullets: Array<{ id: string; text: string }> }>).find((it) => it.id === itemId);
  if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });

  item.bullets.push({ id: `b-${Date.now()}`, text: bulletText.trim() });

  await pool.query(
    "UPDATE master_resume SET content = $1::jsonb, updated_at = now() WHERE id = 1",
    [JSON.stringify(master)],
  );
  return NextResponse.json({ ok: true, master });
}
