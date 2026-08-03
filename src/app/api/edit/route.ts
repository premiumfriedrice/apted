import { NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { withDb, setRlsUser, setRlsUserOnPool } from "@/lib/db";
import { Resume } from "@/lib/resume";
import { generateResume } from "@/lib/llm";
import { getProviderForFlow } from "@/lib/providers";
import { editUserPrompt } from "@/lib/prompts/user";
import { redactResume } from "@/lib/redact";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_UNDO = 20;

const EditRequest = z.object({
  draftId: z.string().min(1, "draftId is required"),
  instruction: z.string().min(1, "instruction is required"),
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setRlsUserOnPool(userId);

  let parsed: z.infer<typeof EditRequest>;
  try {
    parsed = EditRequest.parse(await req.json());
  } catch (e: unknown) {
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
      await setRlsUser(client, userId);
      const dr = await client.query(
        "SELECT id, job_description, content, history FROM drafts WHERE id = $1 AND user_id = $2",
        [parsed.draftId, userId],
      );
      if (!dr.rows[0]) return NextResponse.json({ error: "draft not found" }, { status: 404 });
      const current = Resume.parse(dr.rows[0].content);

      const mr = await client.query("SELECT content FROM master_resume WHERE user_id = $1", [userId]);
      if (!mr.rows[0]) return NextResponse.json({ error: "master_resume missing" }, { status: 400 });
      const master = Resume.parse(mr.rows[0].content);

      // The draft IS the accumulated state — we do NOT replay chat history.
      // Redact PII from master + current draft before sending to LLM (PRE-52).
      const redactedMaster = redactResume(master).redacted;
      const redactedCurrent = redactResume(current).redacted;

      const next = await generateResume(
        editUserPrompt({ master: redactedMaster, current: redactedCurrent, instruction: parsed.instruction }),
        getProviderForFlow(userId, "edit"),
      );

      const prevHistory: unknown[] = Array.isArray(dr.rows[0].history) ? dr.rows[0].history : [];
      const history = [...prevHistory, current].slice(-MAX_UNDO);

      const upd = await client.query(
        `UPDATE drafts
           SET content = $1::jsonb,
               history = $2::jsonb,
               updated_at = now()
         WHERE id = $3
         RETURNING id, job_description, content, history, created_at, updated_at`,
        [JSON.stringify(next), JSON.stringify(history), parsed.draftId],
      );
      const row = upd.rows[0];
      return NextResponse.json({
        id: row.id,
        jobDescription: row.job_description,
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
    const msg = e instanceof Error ? e.message : "edit failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
