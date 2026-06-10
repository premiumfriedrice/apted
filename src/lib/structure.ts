// Two-phase tailor: structure selection.
//
// Phase 1 (cheap model, DeepSeek): takes JD + master resume skeleton and
// returns a filter spec — which sections/items are relevant. This shrinks the
// master before Phase 2 so Claude sees only relevant content.
//
// Phase 2 (Claude): tailors the filtered master against the JD, producing the
// final tailored resume.
import { z } from "zod";
import type { Resume, Section } from "./resume";

// --- Filter spec schema ---------------------------------------------------

// A single item-level keep/drop decision.
const ItemFilter = z.object({
  id: z.string(),
  keep: z.boolean(),
});

// A section-level keep/drop decision, optionally with per-item filtering.
const SectionFilter = z.object({
  id: z.string(),
  keep: z.boolean(),
  items: z.array(ItemFilter).optional(),
});

export const FilterSpec = z.object({
  sections: z.array(SectionFilter),
});

export type FilterSpec = z.infer<typeof FilterSpec>;

// --- Skeleton (what we send to the cheap model — no bullet text) ----------

export interface SectionSkeleton {
  id: string;
  kind: string;
  title: string;
  items: Array<{
    id: string;
    // experience: title + org
    // projects:   name + stack
    // education:  school + degree
    // skills:     category (each item is a skill group)
    // achievements: text
    label: string;
    tags: string[];
  }>;
}

export function toSkeleton(resume: Resume): SectionSkeleton[] {
  return resume.sections.map((sec) => ({
    id: sec.id,
    kind: sec.kind,
    title: sec.title,
    items: sec.items.map((it: Record<string, unknown>) => {
      const tags = (Array.isArray(it.tags) ? it.tags : []) as string[];
      let label = "";
      switch (sec.kind) {
        case "experience":
          label = `${it.title ?? ""} @ ${it.org ?? ""}`.trim();
          break;
        case "projects":
          label = (it.name as string) ?? "";
          if (it.stack) label += ` [${it.stack}]`;
          break;
        case "education":
          label = `${it.school ?? ""} — ${it.degree ?? ""}`.trim();
          break;
        case "skills":
          label = (it.category as string) ?? "";
          break;
        case "achievements":
          label = (it.text as string) ?? "";
          break;
      }
      return { id: (it.id as string) ?? "", label, tags };
    }),
  }));
}

// --- Apply filter: shrink master to only kept sections/items --------------

function filterItems<T extends { id: string }>(items: T[], keep: Set<string>): T[] {
  return items.filter((it) => keep.has(it.id));
}

export function applyFilter(resume: Resume, filter: FilterSpec): Resume {
  const keptIds = new Set<string>();
  const keptItemIds = new Map<string, Set<string>>();
  for (const sf of filter.sections) {
    if (sf.keep) {
      keptIds.add(sf.id);
      if (sf.items) {
        const itemSet = new Set(sf.items.filter((i) => i.keep).map((i) => i.id));
        keptItemIds.set(sf.id, itemSet);
      }
    }
  }

  // Apply filter per section, switching on kind so the discriminated union
  // stays typed through the filter+map chain.
  const filteredSections = resume.sections
    .filter((sec) => keptIds.has(sec.id))
    .map((sec) => {
      const itemSet = keptItemIds.get(sec.id);
      if (!itemSet) return sec;
      switch (sec.kind) {
        case "experience":
          return { ...sec, items: filterItems(sec.items, itemSet) };
        case "projects":
          return { ...sec, items: filterItems(sec.items, itemSet) };
        case "education":
          return { ...sec, items: filterItems(sec.items, itemSet) };
        case "skills":
          return { ...sec, items: filterItems(sec.items, itemSet) };
        case "achievements":
          return { ...sec, items: filterItems(sec.items, itemSet) };
        default:
          return sec;
      }
    });

  return { ...resume, sections: filteredSections };
}

// --- Prompts --------------------------------------------------------------

export function buildStructureSystemPrompt(): string {
  return `You are a structure-selection engine inside apted. Your job is narrow:
read a job description and a master resume skeleton, then decide which
sections and items are relevant to the JD.

Rules:
- Keep sections that match the JD's domain, role, or requirements.
- Drop sections that are clearly irrelevant (e.g. keep "Experience" for a
  software role, drop "Achievements" if they're all hardware/mechanical
  and the JD is for a web frontend role).
- Within kept sections, keep only items whose label or tags suggest they
  are relevant. For example, if the JD asks for React experience, keep
  items tagged "react" or with "React" in the label. Drop items that are
  completely unrelated.
- Be inclusive when in doubt — it is better to keep a borderline item
  than to drop something Claude might have used.
- Skills sections: keep the whole section unless the JD is entirely
  unrelated to tech. Do NOT filter individual skill groups.

Return a single JSON object with this exact shape:
{
  "sections": [
    { "id": "<section-id>", "keep": true, "items": [
      { "id": "<item-id>", "keep": true },
      ...
    ]},
    ...
  ]
}

No prose, no markdown, no code fences. Only the JSON object.`.trim();
}

export function buildStructureUserPrompt(args: {
  jobDescription: string;
  skeleton: SectionSkeleton[];
}): string {
  return `JOB DESCRIPTION
${args.jobDescription}

MASTER RESUME SKELETON (section/item labels + tags — no bullet text):
${JSON.stringify(args.skeleton, null, 2)}

TASK
Return the filter spec JSON deciding which sections and items to keep.`;
}


