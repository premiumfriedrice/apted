// Embedding provider for relevance ranking (PRE-11).
//
// Uses OpenAI text-embedding-3-small (cheapest, $0.02/1M tokens) to convert
// text to a unit-normed vector for cosine-similarity ranking of prior versions
// against a job description.
//
// Gemini also supports embeddings via a separate SDK, but the
// OpenAI-compatible adapter used for chat doesn't expose embeddings.
// Anthropic has no embedding API. For now, only OpenAI is wired up.
import OpenAI from "openai";

export interface EmbeddingProvider {
  /** Display name for logging. */
  readonly name: string;
  /** Convert one text to a unit-normed vector. */
  embed(text: string): Promise<number[]>;
}

// Cached singleton per provider to avoid spamming new OpenAI() on every rank.
let cached: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (cached) return cached;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const client = new OpenAI({ apiKey: key });

  cached = {
    name: `openai/${model}`,
    async embed(text: string): Promise<number[]> {
      const res = await client.embeddings.create({ model, input: text });
      const vec = res.data[0]?.embedding;
      if (!vec) throw new Error("OpenAI embeddings returned empty result");
      return vec;
    },
  };
  return cached;
}

// Cosine similarity between two equal-length vectors. Returns 0..1.
export function cosineSimilarity(a: number[], b: number[]): number {
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
