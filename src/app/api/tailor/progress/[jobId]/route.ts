// GET /api/tailor/progress/:jobId
//
// Polling endpoint for the tailor job lifecycle. Returns the current phase,
// percent, and message. The extension sidepanel polls this while a tailor is
// running to show a progress bar.
//
// PRE-46: Implement tailor progress endpoint (polling-based status).
import { NextResponse } from "next/server";
import { getProgress } from "@/lib/progress";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;
  const state = getProgress(jobId);

  if (!state) {
    return NextResponse.json(
      { error: "job not found", status: "not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    jobId: state.jobId,
    phase: state.phase,
    percent: state.percent,
    message: state.message,
    status: state.status,
    ...(state.error ? { error: state.error } : {}),
  });
}
