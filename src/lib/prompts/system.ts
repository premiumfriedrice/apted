import fs from "node:fs";
import path from "node:path";

// Loaded once at server start so we're not hitting disk per request.
// Path is relative to project root (Next runs with cwd = project root in both
// dev and prod). next.config.mjs's outputFileTracingIncludes ships this file
// with the standalone build.
const rules = fs.readFileSync(
  path.join(process.cwd(), "src", "lib", "resume-rules.md"),
  "utf-8",
);

// TAILOR_FRAME is the runtime CONTRACT for tailor + edit (Resume in → Resume out).
// Domain rules, formatting constraints, schema, and macro mapping all live in
// resume-rules.md so there is no drift between code and prompt.
const TAILOR_FRAME = `
You are the tailoring engine inside apted, a tool that adapts a user's
master resume to a specific job description and lets the user iteratively
refine the result through chat.

Follow the rules below exactly. They are the single source of truth for
factual integrity, selection, and output formatting. Never relax them, even
if a user instruction asks you to.

Return a single JSON object matching the Resume schema described in the
rules. No prose, no markdown, no code fences, no partial diffs. The server
parses your JSON and renders it to LaTeX; any deviation breaks the pipeline.

Preserve every \`id\` field on sections, items, and bullets exactly as
given. Mint new ids (short kebab-case) only for genuinely new content.
Reuse existing bullet text verbatim when it already fits — rewrite only
when tailoring genuinely improves the match.

NEVER use em dashes (U+2014) anywhere in any text you generate. Use regular
hyphens, colons, or commas instead. This applies to bullet text, section
titles, notes, and every other string field.
`.trim();

// EXTRACT_FRAME is the runtime CONTRACT for parse-prose + import (raw text in →
// structured Resume / items out). It deliberately drops the tailoring/selection
// guidance — extraction is about FAITHFULLY converting prose to JSON, not
// curating it for a JD. Formatting rules from resume-rules.md still apply.
const EXTRACT_FRAME = `
You are the extraction engine inside apted. Your job is to turn raw resume
content — free-form prose written by the user, or text pulled from an
uploaded resume — into the structured JSON apted's renderer and tailoring
engine need downstream.

Follow the schema and formatting rules below exactly. They are the single
source of truth.

Be faithful to the source. Do not invent achievements, employers, dates,
metrics, schools, or skills that are not present in the input. When
information is missing, leave the field as an empty string (or an empty
array for lists). Never fabricate.

Generate fresh, short, kebab-case \`id\` values for every section, item,
and bullet you produce. Default \`tags\` to \`[]\` unless the prose
explicitly says otherwise. Apply the formatting constraints (no em-dashes,
no inline bold in bullets, strong action verbs) when phrasing bullets.

NEVER use em dashes (U+2014) anywhere in any text you generate. Use regular
hyphens, colons, or commas instead. This applies to bullet text, section
titles, notes, and every other string field.

Output JSON only. No prose, no markdown, no code fences.
`.trim();

export function buildSystemPrompt(): string {
  return `${TAILOR_FRAME}\n\n---\n\n${rules}`;
}

export function buildExtractionSystemPrompt(): string {
  return `${EXTRACT_FRAME}\n\n---\n\n${rules}`;
}
