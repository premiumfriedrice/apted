import { NextResponse } from "next/server";
import { getUserSettings, setUserSettings } from "@/lib/settings";
import { isTemplate, TEMPLATES, TEMPLATE_LABELS } from "@/lib/render";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getUserSettings(userId);
  return NextResponse.json({
    settings,
    options: TEMPLATES.map((name) => ({ name, label: TEMPLATE_LABELS[name] })),
  });
}

export async function PUT(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { template?: string };
  if (!body.template || !isTemplate(body.template)) {
    return NextResponse.json(
      { error: `template must be one of: ${TEMPLATES.join(", ")}` },
      { status: 400 },
    );
  }
  const settings = await setUserSettings(userId, { template: body.template });
  return NextResponse.json({ settings });
}