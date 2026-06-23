import { NextResponse } from "next/server";
import { compileTexToPdf } from "@/lib/compile";

export const runtime = "nodejs";

// Compile a user-supplied .tex source into a PDF. Used by the master editor
// preview when the user switches to LaTeX view and tweaks the source.
export async function POST(req: Request) {
  const tex = await req.text();
  if (!tex.trim()) {
    return NextResponse.json({ error: "empty tex" }, { status: 400 });
  }
  try {
    const pdf = await compileTexToPdf(tex);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "compile failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
