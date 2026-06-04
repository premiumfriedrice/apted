import { NextResponse } from "next/server";
import { getUserSettings, setUserSettings } from "@/lib/settings";
import { isTemplate, TEMPLATES, TEMPLATE_LABELS } from "@/lib/render";

export const runtime = "nodejs";

export async function GET() {
  const settings = await getUserSettings();
  return NextResponse.json({
    settings,
    options: TEMPLATES.map((name) => ({ name, label: TEMPLATE_LABELS[name] })),
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { template?: string };
  if (!body.template || !isTemplate(body.template)) {
    return NextResponse.json(
      { error: `template must be one of: ${TEMPLATES.join(", ")}` },
      { status: 400 },
    );
  }
  const settings = await setUserSettings({ template: body.template });
  return NextResponse.json({ settings });
}
