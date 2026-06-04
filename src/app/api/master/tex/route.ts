import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const [r, settings] = await Promise.all([
    pool.query("SELECT content FROM master_resume WHERE id = 1"),
    getUserSettings(),
  ]);
  if (!r.rows[0]) return NextResponse.json({ error: "not seeded" }, { status: 404 });
  const tex = renderResume(Resume.parse(r.rows[0].content), settings.template);
  return new NextResponse(tex, {
    headers: {
      "content-type": "application/x-tex; charset=utf-8",
      "content-disposition": `attachment; filename="apted-master.tex"`,
    },
  });
}
