// Bring-your-own API key management. Endpoints:
//   GET    -> { opencode, anthropic, openai, deepseek }: booleans, never values
//   PUT    -> { provider, key } saves one key (empty/whitespace clears)
//   DELETE -> { provider } nulls one key (falls back to env var)
import { NextResponse } from "next/server";
import {
  clearApiKey,
  getKeyStatus,
  isKeyedProvider,
  setApiKey,
} from "@/lib/api-keys";
import { resetProviderCache } from "@/lib/providers/index";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(getKeyStatus(userId));
}

export async function PUT(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { provider, key } = body as { provider?: string; key?: string };
  if (!provider || !isKeyedProvider(provider)) {
    return NextResponse.json(
      { error: "provider must be one of: opencode, anthropic, openai, deepseek" },
      { status: 400 },
    );
  }
  if (typeof key !== "string") {
    return NextResponse.json({ error: "key must be a string" }, { status: 400 });
  }
  await setApiKey(userId, provider, key);
  resetProviderCache(userId);
  return NextResponse.json(getKeyStatus(userId));
}

export async function DELETE(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  if (!provider || !isKeyedProvider(provider)) {
    return NextResponse.json(
      { error: "provider must be one of: opencode, anthropic, openai, deepseek" },
      { status: 400 },
    );
  }
  await clearApiKey(userId, provider);
  resetProviderCache(userId);
  return NextResponse.json(getKeyStatus(userId));
}