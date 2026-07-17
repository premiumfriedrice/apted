import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { compileTexToPdf } from "@/lib/compile";
import { injectResume } from "@/lib/redact";
import type { RedactionMap } from "@/lib/redact";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [r, settings, pm] = await Promise.all([
    pool.query("SELECT content, updated_at FROM master_resume WHERE user_id = $1", [userId]),
    getUserSettings(userId),
    pool.query("SELECT map FROM master_pii_map WHERE user_id = $1", [userId]),
  ]);
  if (!r.rows[0]) return NextResponse.json({ error: "not seeded" }, { status: 404 });

  // Inject PII back before rendering (PRE-53).
  const piiMap = pm.rows[0]?.map as RedactionMap | null;
  let content = Resume.parse(r.rows[0].content);
  if (piiMap) content = injectResume(content, piiMap);

  const tex = renderResume(content, settings.template);
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