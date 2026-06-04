// Renderer dispatcher. The user's chosen template (from user_settings) picks
// which renderer turns Resume JSON into a source string. Add a new template
// by dropping in a sibling file and wiring it through TEMPLATES + the switch.
import type { Resume } from "../resume";
import { renderJake } from "./jake";

export const TEMPLATES = ["jake"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<TemplateName, string> = {
  jake: "Jake Gutierrez (one-page LaTeX classic)",
};

export const DEFAULT_TEMPLATE: TemplateName = "jake";

export function isTemplate(s: string): s is TemplateName {
  return (TEMPLATES as readonly string[]).includes(s);
}

export function renderResume(resume: Resume, template: TemplateName): string {
  switch (template) {
    case "jake":
      return renderJake(resume);
  }
}
