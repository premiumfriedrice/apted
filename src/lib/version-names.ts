import { getProvider } from "./providers";
import type { Resume } from "./resume";

const SYSTEM_PROMPT = `You are a resume labeling assistant. Read the resume and job description, then identify the resume's main focus and domain.

Return a name in one of these formats:
- "{Role} — {theme1}/{theme2}" (e.g., "Software Engineer — Data/Infra")
- "{Domain}-focused {Role}" (e.g., "Data-focused Backend Engineer")
- "{Role} — {domain}" (e.g., "Forward-Deployed Engineer — Platform")

Good themes/domains: Data, ML/AI, DevOps, Infrastructure, Platform, Forward-Deployed, Customer-Facing, Full-Stack, Backend, Mobile, Embedded, Security, Quantitative, SaaS, Cloud, Distributed Systems.

Requirements:
- 4 to 8 words
- Tell what the resume emphasizes beyond just the job title
- Bad examples: "Software Engineer Intern", "Resume Version", "Version from 2026-07-03"
- Return ONLY the name as plain text. No JSON, no quotes, no explanation.`;

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
    const cleaned = raw.trim().replace(/^["']|["']$/g, "").split("\n")[0]?.trim();
    if (cleaned && !looksLikeJunk(cleaned)) {
      return cleaned;
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
    lower.startsWith("{") ||
    lower.startsWith("name") ||
    lower.length < 4
  );
}

function fallbackName(
  resume: Resume,
  cleanedJD?: string | null,
  role?: string,
): string {
  // Build a richer fallback from role + skill/domain hints.
  const hints: string[] = [];

  if (cleanedJD) {
    const domains = [
      { label: "Data", regex: /\bdata\b/i },
      { label: "ML/AI", regex: /\b(machine learning|ml|ai|artificial intelligence)\b/i },
      { label: "DevOps", regex: /\b(devops|sre|platform engineer|infrastructure)\b/i },
      { label: "Security", regex: /\bsecurity\b/i },
      { label: "Mobile", regex: /\b(android|ios|mobile)\b/i },
      { label: "Frontend", regex: /\bfrontend|front-end\b/i },
      { label: "Backend", regex: /\bbackend|back-end\b/i },
      { label: "Full-Stack", regex: /\bfull[- ]?stack\b/i },
      { label: "Cloud", regex: /\b(aws|gcp|azure|cloud)\b/i },
      { label: "Quant", regex: /\b(quantitative|trading|finance)\b/i },
    ];
    for (const domain of domains) {
      if (domain.regex.test(cleanedJD)) hints.push(domain.label);
    }
  }

  if (role?.trim()) {
    if (hints.length > 0) {
      return `${role.trim()} — ${hints.slice(0, 2).join("/")}`.slice(0, 60);
    }
    return role.trim().slice(0, 60);
  }

  if (hints.length > 0) {
    return hints.slice(0, 3).join("/").slice(0, 60);
  }

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
