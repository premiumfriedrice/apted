// POST /api/applications/track
//
// Free-text tracking updates from the extension's tracking dialogue
// ("stripe rejected me after round 2"). Parses the text into structured ops
// (create / update) with the edit-flow LLM, applies them directly, and
// returns a short confirmation reply + summary of what changed.
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool, setRlsUserOnPool } from "@/lib/db";
import { getProviderForFlow } from "@/lib/providers";
import { requireUserId } from "@/lib/auth";
import { ensureApiKeysLoaded } from "@/lib/api-keys";
import { isOutcome, parseInterviewRound, parseRejectedAfterRound } from "@/lib/applications";

export const runtime = "nodejs";

const OpSchema = z.object({
  action: z.enum(["create", "update"]),
  company: z.string().min(1),
  role: z.string().optional(),
  outcome: z.string().optional(),
  interviewRound: z.number().optional(),
  rejectedAfterRound: z.number().optional(),
  notes: z.string().optional(),
});

const TrackSchema = z.object({
  reply: z.string(),
  ops: z.array(OpSchema),
});

const SYSTEM_PROMPT = `You convert a job-seeker's status update into structured tracking operations.

You receive:
- "text": what the user just said
- "current": the job page they were viewing, if any (company / role)
- "tracked": JSON list of their tracked applications

Return ONLY a JSON object: {"reply": string, "ops": [...]}

Each op:
{"action": "create" | "update",
 "company": string (required),
 "role": string (create only),
 "outcome": "draft" | "applied" | "ghosted" | "interviewing" | "rejected" | "offer" | "declined",
 "interviewRound": integer >= 1,
 "rejectedAfterRound": integer >= 0,
 "notes": string}

Rules:
- Prefer "update" when the company matches a tracked application (case-insensitive, allow typos/short forms). Use the tracked company's exact spelling.
- Use "create" only for genuinely new applications. Role: from current context, the text, or "Unknown Role".
- interviewRound: the round number if stated. If they advanced from round N, use N+1. Otherwise 1 when outcome is "interviewing".
- rejectedAfterRound: 0 = rejected before any interview, 1 = after a first/technical round, 2+ = after final rounds.
- "reply": ONE short sentence confirming what you did, plain text, no emoji, no quotes.
- If the text is not about tracking a job application, return ops: [] and a reply asking for a tracking update.
- Apply at most a few ops; the user speaks about one thing at a time.`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1) return text.trim();
  return text.slice(first, last + 1);
}

type TrackedRow = {
  company: string;
  role: string;
  outcome: string;
  interview_round: number | null;
  rejected_after_round: number | null;
};

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setRlsUserOnPool(userId);

  const body = await req.json();
  const { text, currentCompany, currentRole } = body as {
    text?: string;
    currentCompany?: string;
    currentRole?: string;
  };
  if (!text?.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  // Context: the user's tracked applications.
  const tracked = await pool.query<TrackedRow>(
    `SELECT company, role, outcome, interview_round, rejected_after_round
     FROM applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [userId],
  );

  const userPrompt = JSON.stringify({
    text,
    current: { company: currentCompany ?? "", role: currentRole ?? "" },
    tracked: tracked.rows.map((r) => ({
      company: r.company,
      role: r.role,
      outcome: r.outcome,
      interviewRound: r.interview_round,
      rejectedAfterRound: r.rejected_after_round,
    })),
  });

  let parsed: z.infer<typeof TrackSchema>;
  try {
    await ensureApiKeysLoaded(userId);
    const provider = getProviderForFlow(userId, "edit");
    const raw = await provider.complete({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 512,
      schema: TrackSchema,
    });
    parsed = TrackSchema.parse(JSON.parse(extractJson(raw)));
  } catch (e) {
    console.error("track parse error:", e);
    return NextResponse.json(
      { error: "Could not understand that update. Try rephrasing." },
      { status: 502 },
    );
  }

  const summary: string[] = [];
  for (const op of parsed.ops) {
    const oc = op.outcome && isOutcome(op.outcome) ? op.outcome : undefined;
    const round = parseInterviewRound(op.interviewRound ?? null);
    const rejRound = parseRejectedAfterRound(op.rejectedAfterRound ?? null);

    if (op.action === "create") {
      const r = await pool.query(
        `INSERT INTO applications (user_id, company, role, job_description, outcome, interview_round, rejected_after_round, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          op.company.trim(),
          (op.role ?? currentRole ?? "Unknown Role").trim() || "Unknown Role",
          "",
          oc ?? "applied",
          oc === "interviewing" ? (round ?? 1) : null,
          oc === "rejected" ? (rejRound ?? null) : null,
          op.notes?.trim() || null,
        ],
      );
      summary.push(`logged ${op.company} (${oc ?? "applied"})`);
      continue;
    }

    // update: match by company (case-insensitive), newest first.
    const match = await pool.query<{ id: string }>(
      `SELECT id FROM applications
       WHERE user_id = $1 AND lower(company) = lower($2)
       ORDER BY created_at DESC LIMIT 1`,
      [userId, op.company.trim()],
    );
    if (!match.rows[0]) {
      summary.push(`no application found for ${op.company}`);
      continue;
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (oc) { sets.push(`outcome = $${i++}`); vals.push(oc); }
    if (round !== null) { sets.push(`interview_round = $${i++}`); vals.push(oc === "interviewing" ? round : null); }
    if (rejRound !== null) { sets.push(`rejected_after_round = $${i++}`); vals.push(oc === "rejected" ? rejRound : null); }
    if (op.role?.trim()) { sets.push(`role = $${i++}`); vals.push(op.role.trim()); }
    if (op.notes?.trim()) { sets.push(`notes = $${i++}`); vals.push(op.notes.trim()); }
    if (!sets.length) { summary.push(`nothing to update for ${op.company}`); continue; }
    vals.push(match.rows[0].id, userId);
    await pool.query(
      `UPDATE applications SET ${sets.join(", ")} WHERE id = $${i++} AND user_id = $${i}`,
      vals,
    );
    summary.push(`updated ${op.company}${oc ? ` → ${oc}` : ""}`);
  }

  return NextResponse.json({
    reply: parsed.reply,
    summary,
  });
}
