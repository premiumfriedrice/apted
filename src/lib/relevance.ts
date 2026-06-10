// Pick the prior tailored versions worth sending to /api/tailor as framing
// hints. Sending all 20 most-recent is wasteful (tokens) and domain-blind — a
// platform-engineering resume shouldn't frame a mobile-development JD.
//
// Two rankers behind the same signature:
//   - keyword (default): token overlap between JD and version role/tags/skills
//   - embeddings (opt-in via TAILOR_RANKER=embeddings): cosine similarity of
//     OpenAI text-embedding-3-small vectors
//
// Set TAILOR_RANKER=embeddings to swap. The caller only ever calls one
// function — no conditional logic needed at the call site (APTED-011, PRE-11).
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

// --- Keyword-overlap ranker (default) -------------------------------------

// Returns the topK versions most relevant to the JD, highest overlap first.
// Ties break toward the earlier input (callers pass newest-first), so recency
// is the tiebreaker. Versions with zero overlap are still eligible to fill the
// slots if there aren't K relevant ones — they're just ranked last.
function rankByKeywords(
  jobDescription: string,
  versions: PriorVersion[],
  topK: number,
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

// --- Embeddings-based ranker (opt-in via TAILOR_RANKER=embeddings) ---------

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(
      `OpenAI embeddings API ${res.status}: ${err.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return json.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function rankByEmbeddings(
  jobDescription: string,
  versions: PriorVersion[],
  topK: number,
): Promise<PriorVersion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "TAILOR_RANKER=embeddings but OPENAI_API_KEY is not set — falling back to keyword ranker",
    );
    return rankByKeywords(jobDescription, versions, topK);
  }

  const texts = versions.map((v) => profileText(v));
  // Get JD embedding + all version embeddings in parallel. Individual calls
  // rather than a batch because the cost is negligible (~$0.0001 per profile)
  // and batching adds retry complexity for little gain at <20 profiles.
  const [jdEmbedding, ...versionEmbeddings] = await Promise.all([
    getEmbedding(jobDescription.slice(0, 8000), apiKey),
    ...texts.map((t) => getEmbedding(t.slice(0, 8000), apiKey)),
  ]);

  return versions
    .map((v, i) => ({
      v,
      similarity: cosineSimilarity(jdEmbedding, versionEmbeddings[i]),
      index: i,
    }))
    .sort((a, b) => b.similarity - a.similarity || a.index - b.index)
    .slice(0, topK)
    .map((s) => s.v);
}

// --- Public API ------------------------------------------------------------

// Returns the topK versions most relevant to the JD. Dispatches to the keyword
// ranker by default; set TAILOR_RANKER=embeddings to use semantic similarity.
// When the embeddings ranker is active the return is a Promise (async API call);
// the keyword path returns synchronously. Callers should await unconditionally
// — the sync path resolves immediately.
export function rankPriorVersions(
  jobDescription: string,
  versions: PriorVersion[],
  topK?: number,
): PriorVersion[] | Promise<PriorVersion[]> {
  const k = topK ?? (Number(process.env.TAILOR_RELEVANT_VERSIONS) || 5);
  if (process.env.TAILOR_RANKER === "embeddings") {
    return rankByEmbeddings(jobDescription, versions, k);
  }
  return rankByKeywords(jobDescription, versions, k);
}
