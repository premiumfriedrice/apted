import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { getRanker } from "@/lib/relevance";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const { jobDescription } = body as { jobDescription?: string };
  if (!jobDescription?.trim()) {
    return NextResponse.json({ error: "jobDescription required" }, { status: 400 });
  }

  // Fetch all resume versions.
  const { rows } = await pool.query(
    "SELECT company, role, job_description, tailored_content FROM resume_versions ORDER BY created_at DESC",
  );

  if (!rows.length) {
    return NextResponse.json({ similar: [] });
  }

  // Parse tailored_content into Resume objects for the ranker.
  const versions = rows
    .map((row: Record<string, unknown>) => {
      try {
        const content = Resume.parse(row.tailored_content);
        return {
          company: row.company as string,
          role: row.role as string,
          tailored_content: content,
        };
      } catch {
        return null;
      }
    })
    .filter((v: unknown): v is { company: string; role: string; tailored_content: Resume } => v !== null);

  // Rank by relevance to the JD, top 5.
  const ranker = getRanker();
  const scored = await ranker(jobDescription, versions, 5);

  // Only return versions with a meaningful score (> 10% relevance).
  const similar = scored
    .filter((s) => s.score > 10)
    .map((s) => ({
      company: s.company,
      role: s.role,
      score: s.score,
    }));

  return NextResponse.json({ similar });
}