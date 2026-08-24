import type { Resume, Bullet } from "../resume";
import type { ParseProseKind } from "../llm";

const KIND_LABEL: Record<ParseProseKind, string> = {
  experience: "experience entries (jobs / internships / roles)",
  projects: "project entries (personal, side, or coursework)",
  education: "education entries (schools / programs)",
};

export function parseProseUserPrompt(args: {
  kind: ParseProseKind;
  prose: string;
}) {
  return `INPUT (free-form prose describing one or more ${KIND_LABEL[args.kind]}):
${args.prose}

TASK
Extract every distinct ${args.kind} entry the prose describes and return them as JSON in this exact envelope shape:

{
  "items": [
    /* one object per ${args.kind} entry, matching the ${args.kind}-item schema in the system prompt */
  ]
}

Rules:
- One object per distinct entry. If the prose describes three separate roles, return three items.
- Mint fresh short kebab-case ids for every item and every bullet.
- Bullets: extract the achievements / responsibilities the user described. Phrase them as concise, action-led one-liners - no em-dashes, no inline bold. Do NOT invent bullets that aren't in the prose.
- Notes: if the user provides detail beyond what fits in a one-line bullet - metrics, scope, team size, tech stack, outcomes, impact - dump it all into the notes field. Think of notes as the raw material the tailor will draw from. More detail is always better than less. Example: if the user writes "I built a notification system that handles 10k events/sec and reduced latency from 5s to 300ms, adopted by 3 teams", the bullet can be a concise one-liner but notes should capture all of that detail.
- Missing fields → empty string. Don't fabricate dates, locations, or org names.
- Default \`tags\` to \`[]\` unless the user explicitly tagged the entry.`;
}

export function generateBulletsUserPrompt(args: {
  prose: string;
  existingBullets: Bullet[];
}) {
  return `EXISTING BULLETS (preserve accurate ones, drop contradicted ones):
${JSON.stringify(args.existingBullets)}

NEW PROSE (source of truth for adding/updating bullets):
${args.prose}

TASK
Merge the existing bullets with the new prose detail. Keep bullets that are still accurate, add bullets for achievements/scope mentioned in the prose but not covered, and drop bullets contradicted by the prose. Never fabricate.

Generate as many bullets as the prose supports: one bullet per distinct achievement, responsibility, scope item, metric, technology, or outcome. Do not collapse multiple facts into a single bullet. Each bullet follows XYZ format when facts support it - otherwise keep it factual and concise.

Return ONLY a JSON object with this exact shape:
{
  "bullets": [ /* merged bullet list */ ]
}

Preserve existing bullet ids where possible. Mint fresh short kebab-case ids only for genuinely new bullets.`;
}

export function importResumeUserPrompt(args: { text: string }) {
  return `INPUT (raw resume text - could be pasted, PDF-extracted, or otherwise messy):
${args.text}

TASK
Reconstruct this resume as a single Resume JSON object matching the schema in the system prompt. Extract contact info, experience, projects, education, skills, and any other recognizable sections.

Rules:
- Be faithful. Every fact in your JSON must be present in the input.
- Mint fresh short kebab-case ids for every section, item, and bullet.
- Map naturally to the schema's section kinds (experience / projects / education / skills). If the input has a "Leadership" or "Activities" section, model it as a \`projects\`-kind section with that title - the renderer treats them the same.
- "Achievements" / "Awards" sections that don't have bullet lists can also be modeled as a \`projects\` section with one-liner items, or omitted if the content doesn't fit.
- Bullets are concise, action-led, no em-dashes, no inline bold.
- Notes: always fill notes on experience and project items with every detail the prose provides - metrics, scope, team size, tech, outcomes, impact. More is better. The notes are source material for the tailor; they never appear on the rendered resume.
- Missing fields → empty string. Don't invent.`;
}

export function tailorUserPrompt(args: {
  master: Resume;
  priorVersions: Array<{ company: string; role: string; tailored_content: Resume }>;
  jobDescription: string;
}) {
  return `JOB DESCRIPTION
${args.jobDescription}

MASTER RESUME (ground truth, JSON):
${JSON.stringify(args.master)}

PRIOR TAILORED VERSIONS (framing/emphasis hints only, never facts):
${JSON.stringify(args.priorVersions)}

TASK
Produce a first-pass tailored draft as a single JSON Resume object. Make TWO levels of decisions:
1. Which sections to include (drop entire sections from the master that the JD doesn't call for).
2. Within kept sections, which items and bullets best match the JD.
Respect every rule from the system prompt - especially the section-level inclusion guidance and the worked examples.`;
}

export function editUserPrompt(args: {
  master: Resume;
  current: Resume;
  instruction: string;
}) {
  return `MASTER RESUME (ground truth, JSON):
${JSON.stringify(args.master)}

CURRENT DRAFT (the accumulated state from prior turns):
${JSON.stringify(args.current)}

USER INSTRUCTION
${args.instruction}

TASK
Apply the instruction to the current draft and return the new, complete Resume JSON.

EDITING RULES
- Do not rename sections, project names, job titles, or organizations unless the user explicitly asks.
- Only modify bullet text and section ordering according to the user's instruction. Preserve all other content and structure unless the instruction explicitly requires a change.
- Preserve all section titles, item titles, organization names, and project names exactly as they are.
- Preserve ids. If the user supplied a new real fact, add it and note in your reasoning that it should be offered to save to master.`;
}
