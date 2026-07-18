import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateItemsFromProse, type ParseProseKind } from "@/lib/llm";
import { getProviderForFlow } from "@/lib/providers";
import { parseProseUserPrompt } from "@/lib/prompts/user";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

const KINDS = new Set<ParseProseKind>(["experience", "projects", "education"]);

const MAX_PROSE_CHARS = 10_000;

function isKind(s: string): s is ParseProseKind {
  return KINDS.has(s as ParseProseKind);
}

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { kind, prose } = (body ?? {}) as { kind?: string; prose?: string };

  if (!kind || !isKind(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${[...KINDS].join(", ")}` },
      { status: 400 },
    );
  }
  if (!prose || typeof prose !== "string" || !prose.trim()) {
    return NextResponse.json({ error: "prose is required" }, { status: 400 });
  }
  if (prose.length > MAX_PROSE_CHARS) {
    return NextResponse.json(
      { error: `prose is too long (${prose.length} > ${MAX_PROSE_CHARS} chars)` },
      { status: 413 },
    );
  }

  try {
    const items = await generateItemsFromProse(
      kind,
      parseProseUserPrompt({ kind, prose }),
      getProviderForFlow(userId, "parse-prose"),
    );
    return NextResponse.json({ items });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "schema mismatch", details: e.flatten() },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
