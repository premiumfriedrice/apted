// Shared JSON Schema helpers for provider structured output.
//
// zod-to-json-schema produces a full JSON Schema draft that includes features
// (anyOf, $schema, definitions, default) that some provider APIs reject.
// Sanitize the output to a lowest-common-denominator subset accepted by both
// Anthropic and OpenAI.
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Subset of JSON Schema types we can safely pass to provider APIs.
// We avoid anyOf, oneOf, allOf, $ref, default, and definitions because
// Anthropic's structured-output endpoint rejects them.
type FlatSchema = Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitize(node: unknown, stripToFirstAnyOf: boolean): unknown {
  if (Array.isArray(node)) {
    return node.map((v) => sanitize(v, stripToFirstAnyOf));
  }
  if (!isObject(node)) return node;

  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(node)) {
    // Strip metadata and features unsupported by provider APIs.
    if (key === "$schema" || key === "definitions" || key === "default") continue;
    // Collapse anyOf/oneOf to the first option (for discriminatedUnion).
    // Both Anthropic and OpenAI/Gemini reject anyOf in structured-output mode.
    if ((key === "anyOf" || key === "oneOf") && stripToFirstAnyOf) {
      if (Array.isArray(val) && val.length > 0) {
        return sanitize(val[0], stripToFirstAnyOf);
      }
      continue;
    }
    // Recursively sanitize nested objects.
    out[key] = sanitize(val, stripToFirstAnyOf);
  }

  return out;
}

/**
 * Convert a Zod schema to a sanitized JSON Schema suitable for provider
 * structured-output APIs (Anthropic output_config, OpenAI response_format).
 *
 * The sanitization:
 *  - Strips $schema, definitions, and default fields
 *  - Collapses anyOf/oneOf to the first branch (so discriminator unions
 *    become the first variant — enough for the model to see the shape)
 *
 * Returns the sanitized schema as a plain object.
 */
export function toProviderJsonSchema(schema: z.ZodType): FlatSchema {
  const raw = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });
  return sanitize(raw, true) as FlatSchema;
}
