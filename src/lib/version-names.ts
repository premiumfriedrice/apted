import { getProvider } from "./providers";
import type { Resume } from "./resume";

const SYSTEM_PROMPT = `You are a resume labeling assistant. Given a resume (as JSON), suggest a short, human-readable name for this resume version.

Requirements:
- 3 to 6 words
- Describe the resume's focus, not a specific job
- Examples: "Senior Frontend — React/TS", "Full-stack Generalist", "Backend — Python/Go", "Staff Engineer — Platform", "Data Science — ML"
- Return ONLY a single JSON object in this exact shape: {"name": "..."}
- No prose, no code fences.`;

export async function generateVersionName(resume: Resume): Promise<string> {
  const provider = getProvider();
  const userPrompt = JSON.stringify(resume, null, 2);

  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 64,
  });

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string") {
      return parsed.name.trim() || fallbackName(resume);
    }
  } catch {
    // Fall through to fallback if JSON parsing fails.
  }

  return fallbackName(resume);
}

function fallbackName(resume: Resume): string {
  const contactName = resume.contact?.name?.trim();
  return contactName ? `${contactName}'s Version` : "Resume Version";
}
