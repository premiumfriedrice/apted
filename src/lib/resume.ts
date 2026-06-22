// Shared resume schema. Keep tight — Claude must round-trip this shape.
//
// A resume is contact info + an ordered list of sections. Each section has a
// `kind` that picks the renderer:
//   - experience:   list of jobs (resumeSubheading) with bullets
//   - projects:     list of projects (resumeProjectHeading) with bullets
//   - education:    list of schools (resumeSubheading) with bullets
//   - skills:       ordered groups of "Category: items"
//   - achievements: one-line entries; "Title - detail" rendered bold/plain
//
// Bullets carry a stable `id` so the chat can target one ("strengthen bullet 3").
import { z } from "zod";

export const Bullet = z.object({
  id: z.string(),
  text: z.string(),
});

// tags act as a soft selection signal for the tailor step. When a JD aligns
// with certain tags, Claude prefers items carrying matching tags. Omitting
// tags entirely is fine — the rule only activates when present.
export const ExperienceItem = z.object({
  id: z.string(),
  title: z.string(),         // e.g. "Senior Engineer"
  org: z.string(),           // e.g. "Acme Inc."
  location: z.string().default(""),
  start: z.string().default(""),  // free text, e.g. "May 2024"
  end: z.string().default(""),    // free text, e.g. "Present"
  bullets: z.array(Bullet).default([]),
  notes: z.string().default(""),  // raw prose: details, metrics, context — never rendered
  tags: z.array(z.string()).nullish().transform((x) => x ?? []),
});

export const ProjectItem = z.object({
  id: z.string(),
  name: z.string(),
  stack: z.string().default(""),  // "Python, FastAPI, Postgres"
  start: z.string().default(""),
  end: z.string().default(""),
  bullets: z.array(Bullet).default([]),
  notes: z.string().default(""),  // raw prose: details, metrics, context — never rendered
  tags: z.array(z.string()).nullish().transform((x) => x ?? []),
});

export const EducationItem = z.object({
  id: z.string(),
  school: z.string(),
  degree: z.string().default(""),
  location: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  bullets: z.array(Bullet).default([]),
  tags: z.array(z.string()).nullish().transform((x) => x ?? []),
});

export const SkillGroup = z.object({
  id: z.string(),
  category: z.string(),       // "Languages"
  items: z.string(),          // "TypeScript, Python, Go"
});

// One freeform line per achievement (e.g. "1st Place Overall - TAMUHack 2026
// Hackathon"). The renderer splits on the first " - " to produce
// \textbf{title}{- detail}. If no separator, the whole line is bolded.
const AchievementItem = z.object({
  id: z.string(),
  text: z.string(),
});

export type ExperienceItem = z.infer<typeof ExperienceItem>;
export type ProjectItem = z.infer<typeof ProjectItem>;
export type EducationItem = z.infer<typeof EducationItem>;
export type SkillGroup = z.infer<typeof SkillGroup>;
export type AchievementItem = z.infer<typeof AchievementItem>;

export const Section = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("experience"),   title: z.string(), items: z.array(ExperienceItem).default([])   }),
  z.object({ id: z.string(), kind: z.literal("projects"),     title: z.string(), items: z.array(ProjectItem).default([])      }),
  z.object({ id: z.string(), kind: z.literal("education"),    title: z.string(), items: z.array(EducationItem).default([])    }),
  z.object({ id: z.string(), kind: z.literal("skills"),       title: z.string(), items: z.array(SkillGroup).default([])       }),
  z.object({ id: z.string(), kind: z.literal("achievements"), title: z.string(), items: z.array(AchievementItem).default([])  }),
]);

export const Contact = z.object({
  name: z.string(),
  title: z.string().optional(),
  phone: z.string().default(""),
  email: z.string().default(""),
  links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
});

export const Resume = z.object({
  contact: Contact,
  sections: z.array(Section).default([]),
});

export type Resume = z.infer<typeof Resume>;
export type Section = z.infer<typeof Section>;
export type Bullet = z.infer<typeof Bullet>;
export type Contact = z.infer<typeof Contact>;

// API response shapes. These live here (rather than duplicated in client
// components) so every consumer — builder page, extension — uses the same
// definition. When the schema changes, these update automatically.
export interface Draft {
  id: string;
  jobDescription: string;
  content: Resume;
  history: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  company: string;
  role: string;
  jobDescription: string;
  tailoredContent: Resume;
  outcome: string;
  createdAt: string;
}

export function emptyMaster(): Resume {
  return {
    contact: { name: "", phone: "", email: "", links: [] },
    sections: [
      { id: "education",    kind: "education",    title: "Education",        items: [] },
      { id: "experience",   kind: "experience",   title: "Experience",       items: [] },
      { id: "projects",     kind: "projects",     title: "Projects",         items: [] },
      { id: "achievements", kind: "achievements", title: "Achievements",     items: [] },
      { id: "skills",       kind: "skills",       title: "Technical Skills", items: [] },
    ],
  };
}
