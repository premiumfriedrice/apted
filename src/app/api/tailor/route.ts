import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { withDb } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateResume } from "@/lib/llm";
import { getProviderForFlow } from "@/lib/providers";
import { rankPriorVersions } from "@/lib/relevance";
import { tailorUserPrompt } from "@/lib/prompts/user";

export const runtime = "nodejs";

// How many relevant prior versions to send as framing hints (PRE-11).
// Configurable via env; defaults to 5.
const RELEVANT_VERSIONS = Number(process.env.TAILOR_RELEVANT_VERSIONS) || 5;

const TailorBody = z.object({
  jobDescription: z.string().min(1),
});

export async function POST(req: Request) {
  let body: z.infer<typeof TailorBody>;
  try {
    body = TailorBody.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request body", details: e.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    return await withDb(async (client) => {
      const mr = await client.query("SELECT content FROM master_resume WHERE id = 1");
      if (!mr.rows[0]) {
        return NextResponse.json({ error: "master_resume not seeded" }, { status: 400 });
      }
      const master = Resume.parse(mr.rows[0].content);

      const vr = await client.query(
        "SELECT company, role, tailored_content FROM resume_versions ORDER BY created_at DESC LIMIT 20",
      );
      const priorVersions = vr.rows.map((r) => ({
        company: r.company,
        role: r.role,
        tailored_content: Resume.parse(r.tailored_content),
      }));

      const relevantVersions = await rankPriorVersions(body.jobDescription, priorVersions, RELEVANT_VERSIONS);

      const draft = await generateResume(
        tailorUserPrompt({ master, priorVersions: relevantVersions, jobDescription: body.jobDescription }),
        getProviderForFlow("tailor"),
      );

      const ins = await client.query(
        `INSERT INTO drafts (job_description, content, history)
         VALUES ($1, $2::jsonb, '[]'::jsonb)
         RETURNING id, content, history, created_at, updated_at`,
        [body.jobDescription, JSON.stringify(draft)],
      );
      const row = ins.rows[0];
      return NextResponse.json({
        id: row.id,
        jobDescription: body.jobDescription,
        content: row.content,
        history: row.history,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "schema mismatch", details: e.flatten() },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "tailor failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
