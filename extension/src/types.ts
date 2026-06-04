// Mirrors the shape returned by the apted web app's API. Kept dependency-free
// so background, sidepanel, and options can all share it cheaply.

export type Link = { label: string; href: string };
export type Contact = {
  name: string;
  phone?: string;
  email?: string;
  links?: Link[];
};

export type Bullet = { id: string; text: string };

export type ExperienceItem = {
  id: string;
  title: string;
  org: string;
  location?: string;
  start?: string;
  end?: string;
  bullets: Bullet[];
};

export type ProjectItem = {
  id: string;
  name: string;
  stack?: string;
  start?: string;
  end?: string;
  bullets: Bullet[];
};

export type EducationItem = {
  id: string;
  school: string;
  degree?: string;
  location?: string;
  start?: string;
  end?: string;
  bullets: Bullet[];
};

export type SkillGroup = { id: string; category: string; items: string };

export type Section =
  | { id: string; kind: "experience"; title: string; items: ExperienceItem[] }
  | { id: string; kind: "projects"; title: string; items: ProjectItem[] }
  | { id: string; kind: "education"; title: string; items: EducationItem[] }
  | { id: string; kind: "skills"; title: string; items: SkillGroup[] };

export type Resume = { contact: Contact; sections: Section[] };

export type Draft = {
  id: string;
  jobDescription: string;
  content: Resume;
  history: Resume[];
  createdAt: string;
  updatedAt: string;
};

export type Outcome = "draft" | "applied" | "interview" | "offer" | "rejected";

export type Version = {
  id: string;
  company: string;
  role: string;
  jobDescription: string;
  tailoredContent: Resume;
  outcome: Outcome;
  createdAt: string;
};

export type ScrapedJob = {
  url: string;
  title: string;
  company: string;
  jobDescription: string;
  source: "linkedin" | "greenhouse" | "lever" | "workday" | "generic";
};

export type OpenMode = "popup" | "window";

export type Settings = {
  apiBase: string;
  authToken: string;
  openMode: OpenMode;
};
