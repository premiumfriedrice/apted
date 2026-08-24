import { NextResponse } from "next/server";
import { getProviderForFlow } from "@/lib/providers";
import { requireUserId } from "@/lib/auth";
import { ensureApiKeysLoaded } from "@/lib/api-keys";
import { z } from "zod";

export const runtime = "nodejs";

const ExtractSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string(),
  terms: z.array(z.string()),
});

const SYSTEM_PROMPT = `You extract structured fields from job descriptions.

Rules:
- "company": The hiring company name. Use the official name, not a team/division. E.g. "Google" not "Google Cloud", "Stripe" not "Stripe, Inc." If no company is mentioned, try to infer it from the URL domain. E.g. "careers.leidos.com" → "Leidos", "jobs.ashbyhq.com/acme" → "Acme".
- "title": The job title as written. E.g. "Senior React Engineer" not "Senior React Engineer at Stripe"
- "location": The job location as written. E.g. "San Francisco, CA" or "Remote". If not mentioned, use an empty string.
- "terms": An array of key skills/technologies mentioned. E.g. ["React", "TypeScript", "Node.js"]. Max 10 items.

Return ONLY a JSON object with these four fields.`;

/** Tolerant JSON extraction — handles code fences and surrounding text. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1) return text.trim();
  return text.slice(first, last + 1);
}

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureApiKeysLoaded(userId);

  const body = await req.json();
  const { title: domTitle, company: domCompany, jobDescription, url, source } = body as {
    url?: string;
    title?: string;
    company?: string;
    jobDescription?: string;
    source?: string;
  };

  if (!jobDescription?.trim()) {
    return NextResponse.json(
      { error: "jobDescription required" },
      { status: 400 },
    );
  }

  // Use first 3000 chars — company/title/location always appear early.
  const snippet = jobDescription.slice(0, 3000);

  // Build the user prompt, including URL and any context.
  const hints: string[] = [];
  if (url) hints.push(`URL: ${url}`);
  if (domTitle) hints.push(`DOM-extracted title: ${domTitle}`);
  if (domCompany) hints.push(`DOM-extracted company: ${domCompany}`);
  if (source) hints.push(`Source site: ${source}`);
  const userPrompt = hints.length
    ? `${hints.join("\n")}\n\n${snippet}`
    : snippet;

  try {
    const provider = getProviderForFlow(userId, "edit");
    const raw = await provider.complete({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 512,
      schema: ExtractSchema,
    });

    const parsed = ExtractSchema.parse(JSON.parse(extractJson(raw)));

    // If the LLM returned empty values but DOM had them, fall back to DOM.
    return NextResponse.json({
      title: parsed.title || domTitle || "",
      company: parsed.company || domCompany || "",
      location: parsed.location || "",
      terms: parsed.terms || [],
    });
  } catch (e) {
    console.error("extract error:", e);
    // Fall back to whatever the DOM scrapers found.
    return NextResponse.json({
      title: domTitle || "",
      company: domCompany || "",
      location: "",
      terms: [],
    });
  }
}