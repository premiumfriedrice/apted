export const OUTCOMES = [
  "draft",
  "applied",
  "interview",
  "offer",
  "rejected",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export type Application = {
  id: string;
  versionId: string;
  company: string;
  role: string;
  jobDescription: string;
  outcome: Outcome;
  createdAt: string;
};

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && OUTCOMES.includes(value as Outcome);
}
