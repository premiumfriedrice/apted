import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";

export const runtime = "nodejs";

export async function GET() {
  const [r, settings] = await Promise.all([
    pool.query("SELECT content, updated_at FROM master_resume WHERE id = 1"),
    getUserSettings(),
  ]);
  if (!r.rows[0]) return NextResponse.json({ error: "not seeded" }, { status: 404 });

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
      // ETag on updated_at so the preview iframe can leverage HTTP caching
      // between debounced refreshes.
      etag: `"${new Date(r.rows[0].updated_at).getTime()}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
