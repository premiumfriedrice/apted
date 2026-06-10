import type OpenAI from "openai";
import type { CompletionRequest, Provider } from "./types";

// One adapter for every OpenAI-compatible endpoint. OpenAI and Google's Gemini
// (via its OpenAI-compatible base URL) share this exact code path — only the
// client's baseURL/key and the model id differ, which the factory in index.ts
// supplies. The SDK's error objects expose `.status` for the llm.ts backoff.
export class OpenAICompatibleProvider implements Provider {
  constructor(
    private client: OpenAI,
    readonly model: string,
    readonly name: string,
  ) {}

  async complete({ system, user, maxTokens }: CompletionRequest): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: maxTokens,
      // JSON mode guarantees syntactically valid JSON without us having to
      // translate the Resume Zod schema to a JSON Schema. The shared Zod parse
      // + one-shot repair in llm.ts still enforces the actual shape. Supported
      // by both OpenAI and Gemini's OpenAI-compatible endpoint.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }
}
