// Pick the prior tailored versions worth sending to /api/tailor as framing
// hints. Sending all 20 most-recent is wasteful (tokens) and domain-blind — a
// platform-engineering resume shouldn't frame a mobile-development JD. We rank
// by keyword/tag overlap between the JD and each version's profile and keep the
// top K. An optional embeddings-based ranker (behind the same signature) can be
// activated via RELEVANCE_RANKER=embeddings when overlap is too brittle.
//
// PRE-11: configurable topK + embeddings ranker.
import type { Resume } from "./resume";
import { cosineSimilarity, getEmbeddingProvider, type EmbeddingProvider } from "./providers/embeddings";

export interface PriorVersion {
  id?: string;
  company: string;
  role: string;
  tailored_content: Resume;
}

export interface ScoredVersion extends PriorVersion {
  score: number;
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

// ── Token-overlap ranker (default, zero I/O) ────────────────────────────

// Returns the topK versions most relevant to the JD, highest overlap first.
// Ties break toward the earlier input (callers pass newest-first), so recency
// is the tiebreaker. Versions with zero overlap are still eligible to fill the
// slots if there aren't K relevant ones — they're just ranked last.
// Scores are normalized to 0-100 relative to the best match in the full set
// (not just topK) so callers see interpretable scores.
export function rankPriorVersions(
  jobDescription: string,
  versions: PriorVersion[],
  topK = 5,
): ScoredVersion[] {
  const jdTokens = tokenize(jobDescription);
  const scored = versions.map((v, index) => {
    const profile = tokenize(profileText(v));
    let raw = 0;
    for (const t of profile) if (jdTokens.has(t)) raw++;
    return { ...v, score: raw, index };
  });

  // Normalize to 0-100 relative to the best overlap in the set.
  const maxRaw = scored.reduce((m, s) => Math.max(m, s.score), 0);
  const normalized = scored.map((s) => ({
    ...s,
    score: maxRaw > 0 ? Math.round((s.score / maxRaw) * 100) : 0,
  }));

  return normalized
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topK)
    .map(({ index, ...s }) => s);
}

// ── Embeddings ranker (opt-in via RELEVANCE_RANKER=embeddings) ──────────

let embeddingsProvider: EmbeddingProvider | null = null;
let embeddingsFailed = false;

function getOrInitEmbeddings(): EmbeddingProvider | null {
  if (embeddingsFailed) return null;
  if (!embeddingsProvider) {
    embeddingsProvider = getEmbeddingProvider();
    if (!embeddingsProvider) {
      embeddingsFailed = true;
      console.warn("relevance: embeddings ranker requested but OPENAI_API_KEY is not set");
    }
  }
  return embeddingsProvider;
}

// Async variant: ranks versions by cosine similarity between the JD embedding
// and each version's profileText embedding. Same sort order (highest first,
// recency tiebreak) and same output shape.
export async function rankPriorVersionsEmbeddings(
  jobDescription: string,
  versions: PriorVersion[],
  topK = 5,
): Promise<ScoredVersion[]> {
  const provider = getOrInitEmbeddings();
  if (!provider) {
    // Fall back to overlap if embeddings can't be initialised.
    console.warn("relevance: embeddings unavailable, falling back to token overlap");
    return rankPriorVersions(jobDescription, versions, topK);
  }

  // Embed the JD once, then each version profile.
  const jdVec = await provider.embed(jobDescription);
  const scored = await Promise.all(
    versions.map(async (v, index) => {
      const profile = profileText(v);
      const pVec = await provider.embed(profile);
      // Cosine similarity is 0-1; normalise to 0-100 for consistency with
      // the overlap ranker.
      const score = Math.round(cosineSimilarity(jdVec, pVec) * 100);
      return { ...v, score, index };
    }),
  );

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topK)
    .map(({ index, ...s }) => s);
}

// ── Ranker router ───────────────────────────────────────────────────────

export type RankerMode = "overlap" | "embeddings";

export function getRankerMode(): RankerMode {
  const mode = process.env.RELEVANCE_RANKER;
  if (mode === "embeddings") return "embeddings";
  return "overlap";
}

// Unified async ranker signature so call sites always `await` regardless of
// which ranker is configured.
export type RankerFn = (
  jobDescription: string,
  versions: PriorVersion[],
  topK?: number,
) => Promise<ScoredVersion[]>;

// Async wrapper for the sync overlap ranker.
async function rankPriorVersionsAsync(
  jobDescription: string,
  versions: PriorVersion[],
  topK = 5,
): Promise<ScoredVersion[]> {
  return rankPriorVersions(jobDescription, versions, topK);
}

// Select the right ranker based on RELEVANCE_RANKER env var. Returns an async
// function so the call site always uses `await`.
export function getRanker(): RankerFn {
  return getRankerMode() === "embeddings" ? rankPriorVersionsEmbeddings : rankPriorVersionsAsync;
}
