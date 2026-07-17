// POST /api/settings/api-keys/test
// Body: { provider: "opencode"|"anthropic"|"openai"|"deepseek" }
// Uses the stored key (DB, falling back to env) to issue a minimal API call
// and reports whether the key works. Returns { ok: boolean, error?: string }.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { isKeyedProvider, resolveApiKey } from "@/lib/api-keys";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

// Minimal model per provider for the probe call — small/cheap where possible.
const PROBE_MODEL: Record<"opencode" | "anthropic" | "openai" | "deepseek", string> = {
  opencode: process.env.OPENCODE_MODEL ?? "claude-sonnet-4-5",
  anthropic: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250514",
  openai: process.env.OPENAI_MODEL ?? "gpt-4.1-nano",
  deepseek: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
};

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { provider } = body as { provider?: string };
  if (!provider || !isKeyedProvider(provider)) {
    return NextResponse.json(
      { error: "provider must be one of: opencode, anthropic, openai, deepseek" },
      { status: 400 },
    );
  }

  const key = resolveApiKey(userId, provider);
  if (!key) {
    return NextResponse.json({ ok: false, error: "No API key configured for this provider." });
  }

  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: key });
      // 1-token completion is the cheapest correctness probe.
      await client.messages.create({
        model: PROBE_MODEL.anthropic,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
    } else {
      const baseURL =
        provider === "opencode" ? OPENCODE_BASE_URL : provider === "deepseek" ? DEEPSEEK_BASE_URL : undefined;
      const client = new OpenAI(baseURL ? { apiKey: key, baseURL } : { apiKey: key });
      await client.chat.completions.create({
        model: PROBE_MODEL[provider],
        max_completion_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message });
  }
}