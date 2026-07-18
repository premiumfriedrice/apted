import { NextResponse } from "next/server";
import { z } from "zod";
import { callAndParse } from "@/lib/llm";
import { getProviderForFlow } from "@/lib/providers";
import { generateBulletsUserPrompt } from "@/lib/prompts/user";
import { Bullet } from "@/lib/resume";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_PROSE_CHARS = 20_000;

const RequestSchema = z.object({
  itemId: z.string(),
  prose: z.string(),
  existingBullets: z.array(Bullet),
});

const ResponseSchema = z.object({
  bullets: z.array(Bullet),
});

const SYSTEM_PROMPT = `You merge existing resume bullets with new prose detail.

Rules:
- Keep existing bullets that are still accurate and supported by the prose.
- Add bullets for achievements/scope mentioned in the prose but not already covered.
- Be exhaustive: extract every distinct achievement, responsibility, scope item, metric, technology, and outcome mentioned in the prose as its own bullet. Do not collapse multiple facts into one bullet.
- Drop bullets contradicted by the prose.
- Never fabricate details not present in the prose or existing bullets.
- Preserve the id of every existing bullet you keep.
- Mint fresh short kebab-case ids only for genuinely new bullets.
- Each bullet follows XYZ format when facts support it; otherwise keep it factual and concise.
- No em-dashes, no inline bold.

Return ONLY a JSON object with shape { "bullets": [...] }.`;

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { itemId, prose, existingBullets } = parsed.data;

  if (!prose.trim()) {
    return NextResponse.json({ error: "prose is required" }, { status: 400 });
  }
  if (prose.length > MAX_PROSE_CHARS) {
    return NextResponse.json(
      { error: `prose too long (${prose.length} > ${MAX_PROSE_CHARS} chars)` },
      { status: 413 },
    );
  }

  try {
    const provider = getProviderForFlow(userId, "edit");
    const result = await callAndParse(
      provider,
      SYSTEM_PROMPT,
      generateBulletsUserPrompt({ prose, existingBullets }),
      (raw) => ResponseSchema.parse(raw),
      ResponseSchema,
    );
    return NextResponse.json({ bullets: result.bullets, notes: prose.trim() });
  } catch (e) {
    console.error("generate-bullets error:", e);
    // Graceful degradation: never lose user data.
    return NextResponse.json({ bullets: existingBullets, notes: prose.trim() });
  }
}
