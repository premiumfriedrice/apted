import type OpenAI from "openai";
import { toProviderJsonSchema } from "./schema";
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

  async complete({ system, user, maxTokens, schema }: CompletionRequest): Promise<string> {
    const body: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };

    // Structured output: when a Zod schema is provided, convert to JSON Schema
    // and use OpenAI's json_schema response format for guaranteed-valid output.
    // Falls back to loose json_object mode when no schema is supplied.
    if (schema) {
      const schemaObj = toProviderJsonSchema(schema);
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "response", schema: schemaObj },
      };
    } else {
      // Loose JSON mode — the model returns syntactically valid JSON without
      // shape guarantees. The Zod parse in llm.ts is the enforcement layer.
      body.response_format = { type: "json_object" };
    }

    const res = await this.client.chat.completions.create(body);
    return res.choices[0]?.message?.content ?? "";
  }
}
