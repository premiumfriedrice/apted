// Heuristic for recognising a job-application confirmation / thank-you page
// after a submit. Exported from its own module so the regex can be unit-tested
// without standing up the drawer content script.

const CONFIRMATION_RE =
  /\/(thank[-_]?you|confirmation|success|submitted|application[-_]?complete)\b/i;

export function isConfirmationUrl(url: string): boolean {
  return CONFIRMATION_RE.test(url);
}

// Button-label heuristic for JS-driven submissions that don't fire a real
// `submit` event. Matches the final-step button verbs on the major job sites:
//   - "Submit Application" (Greenhouse, Ashby, Workday)
//   - "Apply" / "Submit application" (Lever, LinkedIn Easy Apply)
//   - "Send Application"
//
// This deliberately accepts the LinkedIn "Easy Apply" false positive: opening
// Easy Apply now records an `applied` row with the current draft. That tradeoff
// is intentional â the record is harmless and correctable, and the per-draft
// dedup in the drawer caps it at one save per draft (SAVED_DRAFTS_KEY, 10-min
// TTL). "Confirm"-style mid-funnel buttons are NOT matched.
const SUBMIT_VERBS = ["submit", "apply", "send"];
const SUBMIT_VERB_RES = SUBMIT_VERBS.map((v) => new RegExp(`\\b${v}\\b`, "i"));

export function isSubmitButtonLabel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return SUBMIT_VERB_RES.some((re) => re.test(t));
}