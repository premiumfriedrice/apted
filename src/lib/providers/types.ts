// The seam between the resume generators (llm.ts) and whichever model backend
// is configured. Adapters do exactly one thing: take a system+user prompt and
// return the raw assistant text. Retry, JSON repair, and Zod validation all
// live in llm.ts so they're identical across every provider.

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface Provider {
  /** Stable id: "anthropic" | "openai" | "gemini". */
  readonly name: string;
  /** The concrete model id this instance calls. */
  readonly model: string;
  /** One model call. Errors should carry a `.status` for the shared backoff. */
  complete(req: CompletionRequest): Promise<string>;
}
