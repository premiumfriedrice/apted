// Quick probe of the OpenCode Zen API using the env var key.
// Usage: npx tsx --env-file=.env.local scripts/test-llm.ts
import OpenAI from "openai";

const key = process.env.OPENCODE_API_KEY;
if (!key) {
  console.error("OPENCODE_API_KEY not set");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: key,
  baseURL: process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/v1",
});

async function main() {
  // Test 1: plain completion, no response_format (like generate-bullets uses)
  console.log("── Test 1: plain completion (no json mode) ──");
  try {
    const res = await client.chat.completions.create({
      model: process.env.OPENCODE_TAILOR_MODEL ?? "claude-sonnet-4-5",
      max_completion_tokens: 64,
      messages: [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ],
    });
    console.log("✓ success:", JSON.stringify(res.choices[0]?.message?.content));
  } catch (e) {
    console.error("✗ FAILED:", e instanceof Error ? e.message : String(e));
    if ("status" in (e as object)) console.error("  status:", (e as { status?: number }).status);
  }

  // Test 2: loose json_object mode (what extract uses via schema)
  console.log("\n── Test 2: json_object response format ──");
  try {
    const res = await client.chat.completions.create({
      model: process.env.OPENCODE_TAILOR_MODEL ?? "claude-sonnet-4-5",
      max_completion_tokens: 64,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'Return {"ok": true}' },
        { role: "user", content: "ping" },
      ],
    });
    console.log("✓ success:", JSON.stringify(res.choices[0]?.message?.content));
  } catch (e) {
    console.error("✗ FAILED:", e instanceof Error ? e.message : String(e));
    if ("status" in (e as object)) console.error("  status:", (e as { status?: number }).status);
  }

  // Test 3: json_schema response format (what the providers use with Zod schemas)
  console.log("\n── Test 3: json_schema response format ──");
  try {
    const res = await client.chat.completions.create({
      model: process.env.OPENCODE_TAILOR_MODEL ?? "claude-sonnet-4-5",
      max_completion_tokens: 64,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "response",
          schema: {
            type: "object",
            properties: { company: { type: "string" }, title: { type: "string" } },
            required: ["company", "title"],
          },
        },
      },
      messages: [
        { role: "system", content: "Extract company and title from the job description." },
        { role: "user", content: "Software Engineer at Acme Corp" },
      ],
    });
    console.log("✓ success:", JSON.stringify(res.choices[0]?.message?.content));
  } catch (e) {
    console.error("✗ FAILED:", e instanceof Error ? e.message : String(e));
    if ("status" in (e as object)) console.error("  status:", (e as { status?: number }).status);
  }

  // Test 4: max_tokens instead of max_completion_tokens (older param)
  console.log("\n── Test 4: max_tokens (legacy param) ──");
  try {
    const res = await client.chat.completions.create({
      model: process.env.OPENCODE_TAILOR_MODEL ?? "claude-sonnet-4-5",
      max_tokens: 64,
      messages: [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ],
    } as never);
    console.log("✓ success:", JSON.stringify(res.choices[0]?.message?.content));
  } catch (e) {
    console.error("✗ FAILED:", e instanceof Error ? e.message : String(e));
    if ("status" in (e as object)) console.error("  status:", (e as { status?: number }).status);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
