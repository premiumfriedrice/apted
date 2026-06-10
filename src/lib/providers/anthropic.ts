import type Anthropic from "@anthropic-ai/sdk";
import { toProviderJsonSchema } from "./schema";
import type { CompletionRequest, Provider } from "./types";

// Claude adapter. The Anthropic SDK error objects expose `.status`, which the
// backoff loop in llm.ts keys on, so we just let errors propagate.
export class AnthropicProvider implements Provider {
  readonly name = "anthropic";
  constructor(
    private client: Anthropic,
    readonly model: string,
  ) {}

  async complete({ system, user, maxTokens, schema }: CompletionRequest): Promise<string> {
    // Structured output: convert the Zod schema to a sanitized JSON Schema
    // (strip anyOf, default, $schema — Anthropic rejects them).
    const outputConfig = schema
      ? {
          output_config: {
            format: {
              type: "json_schema" as const,
              schema: toProviderJsonSchema(schema),
            },
          },
        }
      : {};

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      // The system prompt (frame + resume-rules.md) is byte-identical across
      // every tailor/edit call, so cache it: repeat calls bill this prefix at
      // ~0.1x instead of full input price. (APTED-011)
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      ...outputConfig,
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}
