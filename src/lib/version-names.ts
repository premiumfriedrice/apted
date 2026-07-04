import { getProvider } from "./providers";
import type { Resume } from "./resume";

const SYSTEM_PROMPT = `You are a resume labeling assistant. Suggest a short, human-readable name for a resume version.

You are given a cleaned job description, the target role, and the resume content. The resume was tailored for that job.

Requirements:
- 3 to 6 words
- Focus on the job title, role, and core skills
- Examples of good names: "Senior Frontend — React/TS", "Backend Engineer — Python/Go", "Staff Platform Engineer", "Data Science — ML", "Product Manager — B2B SaaS", "Investment Banking Analyst", "Android Developer Intern"
- Return ONLY a single JSON object in this exact shape: {"name": "..."}
- No prose, no code fences.`;

const JUNK_PATTERNS = [
  /skip to main content/gi,
  /join our talent network/gi,
  /we['']re hiring/gi,
  /apply now/gi,
  /about us/gi,
  /isCandidateLoggedIn/g,
  /isProfileRegistered/g,
  /\{[^}]*\}/g,
  /<[^>]+>/g,
];

export async function generateVersionName(
  resume: Resume,
  jobDescription?: string,
  role?: string,
): Promise<string> {
  const cleanedJD = cleanJobDescription(jobDescription);

  const provider = getProvider();
  const userPrompt = JSON.stringify(
    {
      role: role?.trim() || null,
      jobDescription: cleanedJD,
      resume,
    },
    null,
    2,
  );

  try {
    const raw = await provider.complete({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 64,
    });
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string") {
      const cleaned = parsed.name.trim();
      if (cleaned && !looksLikeJunk(cleaned)) {
        return cleaned;
      }
    }
  } catch {
    // Fall through to fallback.
  }

  return fallbackName(resume, cleanedJD, role);
}

function cleanJobDescription(text?: string): string | null {
  if (!text) return null;
  let cleaned = text;
  for (const pattern of JUNK_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function looksLikeJunk(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("skip to") ||
    lower.includes("join our talent network") ||
    lower.includes("we're hiring") ||
    lower.includes("apply now") ||
    lower.includes("about us") ||
    lower.includes("is candidate logged in") ||
    lower.includes("[name]") ||
    lower.startsWith("{")
  );
}

function fallbackName(
  resume: Resume,
  cleanedJD?: string | null,
  role?: string,
): string {
  // The target role is usually the cleanest identifier.
  if (role?.trim()) {
    return role.trim().slice(0, 60);
  }

  // Fall back to the first meaningful sentence of the cleaned JD.
  if (cleanedJD) {
    const sentence = cleanedJD.split(".")[0]?.trim();
    if (sentence && sentence.length <= 80) return sentence;
    const words = cleanedJD.split(" ").slice(0, 8).join(" ");
    return words.length > 60 ? `${words.slice(0, 57)}…` : words;
  }

  const contactName = resume.contact?.name?.trim();
  return contactName && contactName !== "[NAME]"
    ? `${contactName}'s Version`
    : "Resume Version";
}
