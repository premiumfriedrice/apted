import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const [r, settings] = await Promise.all([
    pool.query("SELECT content, updated_at FROM drafts WHERE id = $1", [id]),
    getUserSettings(),
  ]);
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const etag = `"${new Date(r.rows[0].updated_at).getTime()}"`;
  // Honor conditional requests so the extension can keep its cached PDF when
  // nothing has changed — skips the (expensive) Tectonic compile entirely.
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { etag } });
  }

  const tex = renderResume(Resume.parse(r.rows[0].content), settings.template);
  let pdf: Buffer;
  try {
    pdf = await compileTexToPdf(tex);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "compile failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      etag,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
