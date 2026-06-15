// Helpers around the Anthropic client. Three public generators:
//   - generateResume(userPrompt)         → Resume   (tailor / edit pipeline)
//   - generateResumeFromText(userPrompt) → Resume   (import / paste pipeline)
//   - generateItemsFromProse(kind, ...)  → Item[]   (parse-prose pipeline)
//
// All three share a single retry-with-backoff call + "repair on bad JSON" loop,
// and run against whichever provider is configured (Claude / OpenAI / Gemini).
import { z } from "zod";
import { getProvider, type Provider } from "./providers";
import {
  EducationItem,
  ExperienceItem,
  ProjectItem,
  Resume,
} from "./resume";
import {
  buildExtractionSystemPrompt,
  buildSystemPrompt,
} from "./prompts/system";

function extractJson(text: string): string {
  // Tolerate accidental code fences even though we told the model not to.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1) return text.trim();
  return text.slice(first, last + 1);
}

// Defensively normalize `tags` on every item so the schema parse never trips
// on a model that dropped or nulled the field. The schema already accepts
// nullish, this just keeps malformed shapes (e.g. tags: "string") from
// erroring downstream.
function normalizeResumeShape(j: unknown): unknown {
  if (!j || typeof j !== "object") return j;
  const sections = (j as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return j;
  for (const sec of sections) {
    if (!sec || typeof sec !== "object") continue;
    const items = (sec as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const it of items) normalizeItemTags(it);
  }
  return j;
}

function normalizeItemTags(it: unknown): void {
  if (!it || typeof it !== "object") return;
  const t = (it as { tags?: unknown }).tags;
  if (!Array.isArray(t)) (it as { tags: string[] }).tags = [];
  const n = (it as { notes?: unknown }).notes;
  if (n === undefined || n === null) (it as { notes: string }).notes = "";
}

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 4;
const MAX_TOKENS = 4096;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Single shared call site with exponential backoff on transient provider
// errors (both the Anthropic and OpenAI SDKs surface `.status`). Returns the
// raw assistant text.
async function callModel(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
  extraSystem = "",
  schema?: z.ZodType,
): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await provider.complete({
        system: systemPrompt + extraSystem,
        user: userPrompt,
        maxTokens: MAX_TOKENS,
        schema,
      });
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      const last = i === MAX_ATTEMPTS - 1;
      if (last || !status || !TRANSIENT_STATUS.has(status)) throw e;
      await sleep(500 * 2 ** i + Math.random() * 250);
    }
  }
  throw new Error("unreachable");
}

// Generic "call Anthropic, parse the response, retry once with a repair prompt
// if parse fails" wrapper. Takes a parser function so the caller can mix a
// Zod schema with normalization however they like. (Passing a Zod schema
// directly here gets noisy because Zod's `.default()` / `.transform()` makes
// the input type diverge from the output type.)
//
// The optional `schema` parameter enables structured output for providers
// that support it (Anthropic output_config, OpenAI json_schema response_format).
export async function callAndParse<T>(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
  parse: (raw: unknown) => T,
  schema?: z.ZodType,
): Promise<T> {
  const tryParse = (raw: string): T => parse(JSON.parse(extractJson(raw)));
  const first = await callModel(provider, systemPrompt, userPrompt, "", schema);
  try {
    return tryParse(first);
  } catch {
    const repair = await callModel(
      provider,
      systemPrompt,
      userPrompt,
      `\n\nYour previous response could not be parsed against the expected schema. ` +
        `Return ONLY a single valid JSON object matching the schema. No prose, no code fences.`,
      schema,
    );
    return tryParse(repair);
  }
}

// --- Public generators -----------------------------------------------------

// Tailor / edit: uses the tailoring system prompt. Existing call sites in
// /api/tailor and /api/edit go through here.
export async function generateResume(
  userPrompt: string,
  provider: Provider = getProvider(),
): Promise<Resume> {
  return callAndParse(provider, buildSystemPrompt(), userPrompt, (raw) =>
    Resume.parse(normalizeResumeShape(raw)),
    Resume,
  );
}

// Import / paste-resume: same schema (full Resume), but the extraction system
// prompt tells the model to be faithful to the source rather than curate.
export async function generateResumeFromText(
  userPrompt: string,
  provider: Provider = getProvider(),
): Promise<Resume> {
  return callAndParse(
    provider,
    buildExtractionSystemPrompt(),
    userPrompt,
    (raw) => Resume.parse(normalizeResumeShape(raw)),
    Resume,
  );
}

// Items-only extraction. The model returns `{ items: [...] }`; we parse the
// items against the kind-specific schema and return them stripped of the
// envelope so the caller can just append them to a section.
export type ParseProseKind = "experience" | "projects" | "education";
export type ExperienceItemT = z.infer<typeof ExperienceItem>;
export type ProjectItemT = z.infer<typeof ProjectItem>;
export type EducationItemT = z.infer<typeof EducationItem>;
type ItemForKind = {
  experience: ExperienceItemT;
  projects: ProjectItemT;
  education: EducationItemT;
};

export async function generateItemsFromProse<K extends ParseProseKind>(
  kind: K,
  userPrompt: string,
  provider: Provider = getProvider(),
): Promise<ItemForKind[K][]> {
  // Pick the kind-specific item schema and wrap it in the `{ items: [...] }`
  // envelope the prompt asks the model to return.
  const itemSchema =
    kind === "experience" ? ExperienceItem
    : kind === "projects" ? ProjectItem
    : EducationItem;
  const envelope = z.object({ items: z.array(itemSchema) });
  const parsed = await callAndParse(
    provider,
    buildExtractionSystemPrompt(),
    userPrompt,
    (raw) => {
      if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
        for (const it of (raw as { items: unknown[] }).items) normalizeItemTags(it);
      }
      return envelope.parse(raw);
    },
    envelope,
  );
  return parsed.items as ItemForKind[K][];
}

// --- Two-phase tailor pipeline: Phase 1 structure selection ----------------

import { FilterSpec } from "./structure";
import { getStructureProvider } from "./providers";
import {
  buildStructureSystemPrompt,
  buildStructureUserPrompt,
  toSkeleton,
} from "./structure";

// Ask the structure provider (cheap model, e.g. DeepSeek) which sections
// and items from the master resume are relevant to this JD. Falls back to
// keeping everything if the provider fails or returns invalid JSON — so the
// pipeline degrades gracefully to the old single-phase behavior.
export async function selectStructure(
  jobDescription: string,
  master: Resume,
): Promise<FilterSpec> {
  const provider = getStructureProvider();
  const system = buildStructureSystemPrompt();
  const user = buildStructureUserPrompt({
    jobDescription,
    skeleton: toSkeleton(master),
  });

  try {
    const raw = await provider.complete({ system, user, maxTokens: 2048, schema: FilterSpec });
    return FilterSpec.parse(JSON.parse(extractJson(raw)));
  } catch (e) {
    // Structure provider failed — keep everything and let Claude see the full master.
    console.warn("Structure provider failed, using full master:", e);
    return fallbackFilterSpec(master);
  }
}

function fallbackFilterSpec(master: Resume): FilterSpec {
  return {
    sections: master.sections.map((s) => ({
      id: s.id,
      keep: true,
      items: s.items.map((it: { id: string }) => ({ id: it.id, keep: true })),
    })),
  };
}
