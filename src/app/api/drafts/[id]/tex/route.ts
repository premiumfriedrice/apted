import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { renderResume } from "@/lib/render";
import { getUserSettings } from "@/lib/settings";
import { injectResume } from "@/lib/redact";
import type { RedactionMap } from "@/lib/redact";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [r, settings, pm] = await Promise.all([
    pool.query("SELECT content FROM drafts WHERE id = $1", [id]),
    getUserSettings(),
    pool.query("SELECT map FROM master_pii_map WHERE id = 1"),
  ]);
  if (!r.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Inject PII back before rendering (PRE-53).
  const piiMap = pm.rows[0]?.map as RedactionMap | null;
  let content = Resume.parse(r.rows[0].content);
  if (piiMap) content = injectResume(content, piiMap);

  const tex = renderResume(content, settings.template);
  return new NextResponse(tex, {
    headers: {
      "content-type": "application/x-tex; charset=utf-8",
      "content-disposition": `attachment; filename="apted-${id}.tex"`,
    },
  });
}
