// Pick the prior tailored versions worth sending to /api/tailor as framing
// hints. Sending all 20 most-recent is wasteful (tokens) and domain-blind — a
// platform-engineering resume shouldn't frame a mobile-development JD. We rank
// by keyword/tag overlap between the JD and each version's profile and keep the
// top K. Pure function, no I/O — swap for embeddings later behind this signature
// if overlap proves too brittle (APTED-011).
import type { Resume } from "./resume";

export interface PriorVersion {
  company: string;
  role: string;
  tailored_content: Resume;
}

// Small, generic stoplist — enough to stop function words from dominating the
// overlap score. Deliberately not a domain list (we want domain terms to count).
const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "have", "has",
  "this", "that", "your", "from", "all", "who", "but", "not", "can", "out",
  "job", "role", "team", "work", "working", "experience", "years", "year",
  "ability", "strong", "including", "etc", "such", "into", "across", "their",
  "they", "them", "what", "when", "where", "which", "while", "about", "able",
]);

function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) ?? [];
  const out = new Set<string>();
  for (const m of matches) {
    if (m.length > 2 && !STOPWORDS.has(m)) out.add(m);
  }
  return out;
}

// The strongest relevance signals for a version: its target role, plus the tags
// and skill/title/stack text from its tailored content. (Bullet prose is noisier
// and is left out to keep the signal sharp.)
function profileText(v: PriorVersion): string {
  const parts: string[] = [v.role, v.company];
  for (const sec of v.tailored_content.sections) {
    switch (sec.kind) {
      case "skills":
        for (const g of sec.items) parts.push(g.category, g.items);
        break;
      case "experience":
        for (const it of sec.items) parts.push(it.title, it.org, ...it.tags);
        break;
      case "projects":
        for (const it of sec.items) parts.push(it.name, it.stack, ...it.tags);
        break;
      case "education":
        for (const it of sec.items) parts.push(it.school, it.degree, ...it.tags);
        break;
      // achievements: freeform text, weak signal — skip.
    }
  }
  return parts.join(" ");
}

// Returns the topK versions most relevant to the JD, highest overlap first.
// Ties break toward the earlier input (callers pass newest-first), so recency
// is the tiebreaker. Versions with zero overlap are still eligible to fill the
// slots if there aren't K relevant ones — they're just ranked last.
export function rankPriorVersions(
  jobDescription: string,
  versions: PriorVersion[],
  topK = 5,
): PriorVersion[] {
  const jdTokens = tokenize(jobDescription);
  return versions
    .map((v, index) => {
      const profile = tokenize(profileText(v));
      let score = 0;
      for (const t of profile) if (jdTokens.has(t)) score++;
      return { v, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topK)
    .map((s) => s.v);
}
