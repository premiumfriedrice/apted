import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { getRanker } from "@/lib/relevance";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { jobDescription } = body as { jobDescription?: string };
  if (!jobDescription?.trim()) {
    return NextResponse.json({ error: "jobDescription required" }, { status: 400 });
  }

  // Fetch the user's resume versions with their most recent application for display.
  const { rows } = await pool.query(
    `SELECT v.id, v.tailored_content, a.company, a.role, v.created_at
     FROM resume_versions v
     LEFT JOIN LATERAL (
       SELECT company, role FROM applications WHERE version_id = v.id ORDER BY created_at DESC LIMIT 1
     ) a ON true
     WHERE v.user_id = $1
     ORDER BY v.created_at DESC`,
    [userId],
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
          id: row.id as string,
          company: (row.company as string) ?? "Untitled",
          role: (row.role as string) ?? "",
          createdAt: row.created_at as string,
          tailored_content: content,
        };
      } catch {
        return null;
      }
    })
    .filter((v: unknown): v is { id: string; company: string; role: string; createdAt: string; tailored_content: Resume } => v !== null);

  // Rank by relevance to the JD, top 5.
  const ranker = getRanker();
  const scored = await ranker(jobDescription, versions, 5);

  // Only return versions with a meaningful score (> 10% relevance).
  const similar = scored
    .filter((s) => s.score > 10)
    .map((s) => ({
      id: s.id,
      company: s.company,
      role: s.role,
      score: s.score,
      createdAt: s.createdAt,
    }));

  return NextResponse.json({ similar });
}
