const key = process.env.OPENCODE_API_KEY;
if (!key) { console.error("OPENCODE_API_KEY not set"); process.exit(1); }

const models = ["claude-sonnet-4-5", "deepseek-v4-flash", "deepseek-v4-flash-free", "claude-haiku-4-5", "gemini-3.5-flash"];

async function main() {
  for (const model of models) {
    try {
      const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: "user", content: "Reply: OK" }] }),
      });
      const body = await res.text();
      console.log(`${model}: ${res.status} ${res.ok ? "OK" : body.slice(0, 120)}`);
    } catch (e) {
      console.log(`${model}: network error ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main();
