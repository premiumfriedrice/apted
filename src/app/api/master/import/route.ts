import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateResumeFromText } from "@/lib/llm";
import { importResumeUserPrompt } from "@/lib/prompts/user";

export const runtime = "nodejs";

// Soft cap on input. Generous enough to fit any reasonable resume's text
// (10–15k chars typical) with headroom for messy PDF extracts, but small
// enough to keep Anthropic context usage predictable.
const MAX_TEXT_CHARS = 50_000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { text } = (body ?? {}) as { text?: string };

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `text is too long (${text.length} > ${MAX_TEXT_CHARS} chars)` },
      { status: 413 },
    );
  }

  try {
    const content = await generateResumeFromText(importResumeUserPrompt({ text }));
    return NextResponse.json({ content });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "schema mismatch", details: e.flatten() },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
