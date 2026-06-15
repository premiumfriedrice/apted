import { NextResponse } from "next/server";
import { z } from "zod";
import { getStructureProvider } from "@/lib/providers";
import { callAndParse } from "@/lib/llm";

export const runtime = "nodejs";

const ExtractRequest = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  jobDescription: z.string().min(1, "jobDescription is required"),
  source: z.string().optional(),
});

const ExtractedFields = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  terms: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are a job-posting field extractor. Given a job description (and optionally a URL, scraped title, scraped company, and source), extract these fields:

- title: the job title/role (e.g. "Android Developer Intern", "Senior Software Engineer"). Strip date suffixes like "– Fall 2026" or "- Summer 2025". Use the most specific title you can find.
- company: the hiring company name (e.g. "Rivian", "Leidos", "Volkswagen Group Technologies"). NOT the job board or ATS name. Look for the actual employer.
- location: the job location (e.g. "Palo Alto, CA", "Remote", "New York, NY / Hybrid"). If multiple locations are listed, prefer the primary one.
- terms: an array of key terms, skills, or qualifications mentioned (e.g. ["Android", "Kotlin", "internship"]). Maximum 10 items. Focus on the most important differentiating requirements.

Be concise and factual. Do not invent information not present in the input.

Return ONLY a JSON object with this shape:
{ "title": "...", "company": "...", "location": "...", "terms": ["..."] }

No prose, no markdown, no code fences.`;

export async function POST(req: Request) {
  let parsed: z.infer<typeof ExtractRequest>;
  try {
    parsed = ExtractRequest.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const userParts: string[] = [];
  if (parsed.url) userParts.push(`URL: ${parsed.url}`);
  if (parsed.source) userParts.push(`Source: ${parsed.source}`);
  if (parsed.title) userParts.push(`Scraped title: ${parsed.title}`);
  if (parsed.company) userParts.push(`Scraped company: ${parsed.company}`);
  userParts.push(`\nJOB DESCRIPTION:\n${parsed.jobDescription}`);

  const userPrompt = userParts.join("\n");

  try {
    const result = await callAndParse(
      getStructureProvider(),
      SYSTEM_PROMPT,
      userPrompt,
      (raw) => ExtractedFields.parse(raw),
      ExtractedFields,
    );
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}