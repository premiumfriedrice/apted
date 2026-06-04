import Anthropic from "@anthropic-ai/sdk";

// Single shared client. Never import this from client components.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-sonnet-4-6";
