import { getProvider } from "./providers";
import type { Resume } from "./resume";

const SYSTEM_PROMPT = `You are a resume labeling assistant. Suggest a short, human-readable name for a resume version.

You are given:
1. The job description the resume was tailored for.
2. The resume content itself.

Requirements:
- 3 to 6 words
- Summarize the job description / target role, not a specific company
- Examples: "Senior Frontend — React/TS", "Backend Engineer — Python/Go", "Staff Platform Engineer", "Data Science — ML", "Product Manager — B2B SaaS"
- Return ONLY a single JSON object in this exact shape: {"name": "..."}
- No prose, no code fences.`;

export async function generateVersionName(
  resume: Resume,
  jobDescription?: string,
): Promise<string> {
  const provider = getProvider();
  const userPrompt = JSON.stringify(
    {
      jobDescription: jobDescription?.trim() || null,
      resume,
    },
    null,
    2,
  );

  const raw = await provider.complete({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 64,
  });

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string") {
      return parsed.name.trim() || fallbackName(resume, jobDescription);
    }
  } catch {
    // Fall through to fallback if JSON parsing fails.
  }

  return fallbackName(resume, jobDescription);
}

function fallbackName(resume: Resume, jobDescription?: string): string {
  if (jobDescription) {
    const firstLine = jobDescription.split("\n")[0]?.trim();
    if (firstLine) {
      const words = firstLine.split(" ").slice(0, 5).join(" ");
      return words.length > 40 ? `${words.slice(0, 40)}…` : words;
    }
  }
  const contactName = resume.contact?.name?.trim();
  return contactName ? `${contactName}'s Version` : "Resume Version";
}
