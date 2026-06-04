import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [r, settings] = await Promise.all([
    pool.query("SELECT content FROM drafts WHERE id = $1", [id]),
    getUserSettings(),
  ]);
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const tex = renderResume(Resume.parse(r.rows[0].content), settings.template);
  return new NextResponse(tex, {
    headers: {
      "content-type": "application/x-tex; charset=utf-8",
      "content-disposition": `attachment; filename="apted-${id}.tex"`,
    },
  });
}
