export const OUTCOMES = [
  "draft",
  "applied",
  "ghosted",
  "interviewing",
  "rejected",
  "offer",
  "declined",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export const TERMINAL_OUTCOMES: Outcome[] = [
  "ghosted",
  "rejected",
  "offer",
  "declined",
];

export type Application = {
  id: string;
  versionId: string;
  company: string;
  role: string;
  jobDescription: string;
  outcome: Outcome;
  interviewRound: number | null;
  rejectedAfterRound: number | null;
  createdAt: string;
};

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && OUTCOMES.includes(value as Outcome);
}

export function parseInterviewRound(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export function parseRejectedAfterRound(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
