// AI-generated insights for a resume version: a short summary of how the
// resume comes across, plus keyword/tags extracted from the content.
//
// Uses the same provider seam as version-names.ts so it works with any
// configured model (Claude / OpenAI / Gemini / …).

import { getProvider } from "./providers";
import type { Resume } from "./resume";
import type { Application } from "./applications";

export interface ResumeInsights {
  summary: string;
  keywords: string[];
  strengths: string[];
  tone: string;
}

const SYSTEM_PROMPT = `You are a resume analysis assistant. Read the resume content and job context, then produce a concise analysis.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2-3 sentence summary of how the resume comes across to a recruiter",
  "keywords": ["5-8 technical/functional keywords that define this resume"],
  "strengths": ["3-4 specific strengths visible in the resume"],
  "tone": "one phrase describing the overall impression (e.g. 'Results-driven senior engineer', 'Analytical data scientist')"
}

Rules:
- Be specific and honest, not generic fluff
- Keywords should reflect actual skills/tools/domains in the resume
- NEVER use em dashes (U+2014) anywhere in the output. Use regular hyphens, colons, or commas instead.
- No quotes around the JSON, no markdown fences, just the JSON object`;

function buildUserPrompt(resume: Resume, applications: Application[]): string {
  const jobContexts = applications
    .slice(0, 5)
    .map((a) => ({ company: a.company, role: a.role }))
    .filter((a) => a.company || a.role);

  return JSON.stringify(
    {
      resume: {
        contact: resume.contact,
        sections: resume.sections.map((s) => ({
          kind: s.kind,
          title: s.title,
          items: s.items,
        })),
      },
      appliedTo: jobContexts,
    },
    null,
    2,
  );
}

export async function generateInsights(
  resume: Resume,
  applications: Application[],
  userId: string,
): Promise<ResumeInsights> {
  const provider = getProvider(userId);
  const userPrompt = buildUserPrompt(resume, applications);

  try {
    const raw = await provider.complete({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 512,
    });

    // Extract JSON from the response.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const text = fenced ? fenced[1].trim() : raw.trim();
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    const jsonStr = first === -1 || last === -1 ? text : text.slice(first, last + 1);

    const parsed = JSON.parse(jsonStr) as Partial<ResumeInsights>;

    if (typeof parsed.summary === "string" && Array.isArray(parsed.keywords)) {
      return {
        summary: parsed.summary,
        keywords: parsed.keywords.filter((k): k is string => typeof k === "string").slice(0, 10),
        strengths: Array.isArray(parsed.strengths)
          ? parsed.strengths.filter((s): s is string => typeof s === "string").slice(0, 6)
          : [],
        tone: typeof parsed.tone === "string" ? parsed.tone : "",
      };
    }
  } catch {
    // Fall through to fallback below.
  }

  // Fallback: derive basic insights without an LLM call.
  return fallbackInsights(resume, applications);
}

function fallbackInsights(resume: Resume, applications: Application[]): ResumeInsights {
  const keywords = new Set<string>();

  for (const section of resume.sections) {
    if (section.kind === "skills") {
      for (const group of section.items) {
        const items = (group as { items?: string }).items ?? "";
        items
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((k) => keywords.add(k));
      }
    }
    if (section.kind === "experience" || section.kind === "projects") {
      for (const item of section.items) {
        const tags = (item as { tags?: string[] }).tags ?? [];
        tags.forEach((t) => keywords.add(t));
      }
    }
  }

  const role = resume.contact.title ?? "";
  const expCount = resume.sections.find((s) => s.kind === "experience")?.items.length ?? 0;

  return {
    summary: `This resume presents ${role || "a candidate"} with ${expCount} experience entr${expCount === 1 ? "y" : "ies"} and has been used for ${applications.length} application${applications.length === 1 ? "" : "s"}.`,
    keywords: Array.from(keywords).slice(0, 8),
    strengths: [],
    tone: role || "Professional",
  };
}
