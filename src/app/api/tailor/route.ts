import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { withDb } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateResume, selectStructure } from "@/lib/llm";
import { getProviderForFlow } from "@/lib/providers";
import { getRanker } from "@/lib/relevance";
import { tailorUserPrompt } from "@/lib/prompts/user";
import { applyFilter } from "@/lib/structure";
import { redactResume } from "@/lib/redact";
import { requireUserId } from "@/lib/auth";
import { checkTailorLimit, recordUsage } from "@/lib/rate-limit";
import {
  createProgress,
  updateProgress,
  finishProgress,
  failProgress,
} from "@/lib/progress";

export const runtime = "nodejs";

// How many relevant prior versions to send as framing hints (PRE-11).
// Configurable via env; defaults to 5.
const RELEVANT_VERSIONS = Number(process.env.TAILOR_RELEVANT_VERSIONS) || 5;

const TailorRequest = z.object({
  jobDescription: z.string().min(1, "jobDescription is required"),
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof TailorRequest>;
  try {
    parsed = TailorRequest.parse(await req.json());
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request body", details: e.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // PRE-93: Free-tier users are limited to FREE_TAILOR_LIMIT tailor sessions
  // per calendar month. Trial/Pro are unmetered. Check BEFORE doing any work
  // so a rejected request never burns an LLM call.
  const limit = await checkTailorLimit(userId);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        limit: limit.limit,
        remaining: limit.remaining,
        // "velocity" = slow down (hourly throttle); "monthly" = upgrade / BYOK.
        reason: limit.reason ?? "monthly",
      },
      { status: 429 },
    );
  }

  const jobId = crypto.randomUUID();
  createProgress(jobId);

  try {
    return await withDb(async (client) => {
      updateProgress(jobId, { phase: "analyzing", percent: 10, message: "Loading master resume…" });
      const mr = await client.query("SELECT content FROM master_resume WHERE user_id = $1", [userId]);
      if (!mr.rows[0]) {
        return NextResponse.json({ error: "master_resume not seeded" }, { status: 400 });
      }
      const master = Resume.parse(mr.rows[0].content);

      const vr = await client.query(
        "SELECT tailored_content FROM resume_versions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
        [userId],
      );
      const priorVersions = vr.rows.map((r) => ({
        company: r.company,
        role: r.role,
        tailored_content: Resume.parse(r.tailored_content),
      }));

      updateProgress(jobId, { phase: "analyzing", percent: 40, message: "Ranking prior versions…" });
      const ranker = getRanker();
      const relevantVersions = await ranker(parsed.jobDescription, priorVersions, RELEVANT_VERSIONS);

      // ── Phase 1: Structure selection ──────────────────────────────
      // Use a cheap model (DeepSeek) to decide which sections/items
      // are relevant to this JD. This shrinks the master before
      // Phase 2 so Claude's prompt is smaller and faster.
      updateProgress(jobId, { phase: "selecting", percent: 50, message: "Selecting relevant sections…" });
      const filter = await selectStructure(parsed.jobDescription, master, userId);
      const filteredMaster = applyFilter(master, filter);

      // ── Phase 2: Tailoring (Claude) ───────────────────────────────
      updateProgress(jobId, { phase: "tailoring", percent: 60, message: "Tailoring resume bullets…" });

      // Redact PII from master + prior versions before sending to LLM (PRE-52).
      const redactedMaster = redactResume(filteredMaster).redacted;
      const redactedPrior = relevantVersions.map((v) => ({
        ...v,
        tailored_content: redactResume(v.tailored_content).redacted,
      }));

      const draft = await generateResume(
        tailorUserPrompt({ master: redactedMaster, priorVersions: redactedPrior, jobDescription: parsed.jobDescription }),
        getProviderForFlow(userId, "tailor"),
      );

      updateProgress(jobId, { phase: "compiling", percent: 90, message: "Saving draft…" });
      const ins = await client.query(
        `INSERT INTO drafts (user_id, job_description, content, history)
         VALUES ($1, $2, $3::jsonb, '[]'::jsonb)
         RETURNING id, content, history, created_at, updated_at`,
        [userId, parsed.jobDescription, JSON.stringify(draft)],
      );
      const row = ins.rows[0];

      // Surface similarity scores for the extension's "Similar resumes" panel.
      const similarResumes = relevantVersions.slice(0, 3).map((v) => ({
        company: v.company,
        role: v.role,
        score: v.score,
      }));

      // PRE-93: record the metered tailor session only after the LLM call
      // + draft insert succeeded, so a 429 or a failed run never counts.
      await recordUsage(userId, "tailor");

      finishProgress(jobId);

      return NextResponse.json({
        id: row.id,
        jobId,
        jobDescription: parsed.jobDescription,
        content: row.content,
        history: row.history,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        similarResumes,
      });
    });
  } catch (e: unknown) {
    failProgress(jobId, e instanceof Error ? e.message : "tailor failed");
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "schema mismatch", details: e.flatten() },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "tailor failed";
    return NextResponse.json({ error: msg, jobId }, { status: 500 });
  }
}