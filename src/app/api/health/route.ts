import { NextResponse } from "next/server";
import { checkCompileService } from "@/lib/compile";

export const runtime = "nodejs";

// Quick health check for the builder's live-preview panel. Returns compile-
// service reachability so the UI can show a warning before the user hits
// compile (PRE-21).
export async function GET() {
  const compileOk = await checkCompileService();
  return NextResponse.json({
    compileService: compileOk ? "ok" : "unreachable",
    uptime: process.uptime(),
  });
}
